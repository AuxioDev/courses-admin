// Runs the real server actions against a throwaway database. Only the framework edges are faked.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signedIn: true,
  adminId: "",
  afterJobs: [] as (() => Promise<void>)[],
}));
const NOT_ADMIN = "SENTINEL_NOT_ADMIN";

vi.mock("@/lib/auth", () => {
  const admin = async () => {
    if (!state.signedIn) throw new Error(NOT_ADMIN);
    return { id: state.adminId, name: "Admin", email: "a@x", timezone: "Asia/Baku", locale: "en" };
  };
  return { getCurrentAdmin: admin, getAdminForConsent: vi.fn(), getAdminForPasswordChange: vi.fn(), getAdminOrNull: vi.fn() };
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (job: () => Promise<void>) => void state.afterJobs.push(job) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("@/i18n", () => ({ getRequestLocale: async () => "en" }));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/teacher-email", () => ({ emailTeachers: vi.fn(async () => undefined) }));
vi.mock("@/lib/password-reset", () => ({ sendResetLink: vi.fn(async () => "sent"), emailResetLinkTo: vi.fn(async () => "sent") }));

import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/db";
import * as actions from "../actions";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const redirectsTo = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  return null;
};

let n = 0;
const user = (role: "student" | "teacher" | "admin", extra: Record<string, unknown> = {}) =>
  db.user.create({ data: { name: role, email: `${role}${++n}@t.local`, passwordHash: "x", role, ...extra } });

beforeEach(async () => {
  await resetDatabase();
  state.signedIn = true;
  state.adminId = (await user("admin")).id;
});
afterAll(() => db.$disconnect());

// Actions that are meant to run before sign-in, or that use the consent / password-change guards.
const NOT_ADMIN_GUARDED = new Set(["login", "logout", "requestPasswordReset", "resetPassword", "changePassword", "acceptPrivacy", "updateLocale"]);

describe("authorization matrix", () => {
  it("every other action refuses a request that is not a signed-in admin, and writes nothing", async () => {
    state.signedIn = false;
    const before = await Promise.all([db.user.count(), db.term.count(), db.course.count(), db.group.count(), db.lesson.count()]);
    const guarded = Object.entries(actions).filter(([name, fn]) => typeof fn === "function" && !NOT_ADMIN_GUARDED.has(name));
    // The filter must see every action in the file, so a new one can't slip past this test unnoticed.
    const source = readFileSync(fileURLToPath(new URL("../actions.ts", import.meta.url)), "utf8");
    const declared = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(guarded.map(([name]) => name).sort()).toEqual(declared.filter((name) => !NOT_ADMIN_GUARDED.has(name)).sort());

    const unguarded: string[] = [];
    for (const [name, fn] of guarded) {
      try {
        // Both arguments are FormData: covers (prev, formData) and (formData) signatures.
        await (fn as (a: unknown, b: unknown) => Promise<unknown>)(form({}), form({}));
        unguarded.push(name);
      } catch (e) {
        if ((e as Error).message !== NOT_ADMIN) unguarded.push(`${name} (${(e as Error).message})`);
      }
    }
    expect(unguarded).toEqual([]);
    expect(await Promise.all([db.user.count(), db.term.count(), db.course.count(), db.group.count(), db.lesson.count()])).toEqual(before);
  });
});

describe("users", () => {
  it("creates teachers and students with a one-time password, never admins", async () => {
    const r = await actions.createUser(undefined, form({ name: "New", email: "NEW@x.az", role: "teacher" }));
    expect(r).toMatchObject({ account: { email: "new@x.az", password: expect.stringMatching(/^[a-z]{4}-\d{4}-[a-z]{4}$/) } });
    const created = await db.user.findUnique({ where: { email: "new@x.az" } });
    expect(created).toMatchObject({ role: "teacher", mustChangePassword: true });
    expect(created!.passwordHash).not.toContain(r!.account!.password);

    expect(await actions.createUser(undefined, form({ name: "Evil", email: "e@x.az", role: "admin" }))).toEqual({ error: "userRole" });
    expect(await actions.createUser(undefined, form({ name: "Dup", email: "new@x.az", role: "student" }))).toEqual({ error: "emailTaken" });
    expect(await actions.createUser(undefined, form({ name: "", email: "e@x.az", role: "student" }))).toEqual({ error: "userName" });
    expect(await actions.createUser(undefined, form({ name: "X", email: "nope", role: "student" }))).toEqual({ error: "userEmail" });
    expect(await db.user.count({ where: { role: "admin" } })).toBe(1);
  });

  it("deactivating signs the person out everywhere; admins cannot deactivate themselves", async () => {
    const student = await user("student");
    expect(await actions.deactivateUser(undefined, form({ userId: student.id }))).toEqual({ ok: "userDeactivated" });
    const after = await db.user.findUnique({ where: { id: student.id } });
    expect(after).toMatchObject({ active: false, sessionVersion: student.sessionVersion + 1 });
    expect(after!.deactivatedAt).toBeInstanceOf(Date);

    expect(await actions.deactivateUser(undefined, form({ userId: state.adminId }))).toEqual({ error: "cannotChangeSelf" });
    expect(await actions.deactivateUser(undefined, form({ userId: "missing" }))).toEqual({ error: "userNotFound" });
  });

  it("deactivating twice keeps the first date (it starts the retention clock)", async () => {
    const student = await user("student");
    await actions.deactivateUser(undefined, form({ userId: student.id }));
    const first = (await db.user.findUnique({ where: { id: student.id } }))!.deactivatedAt!;
    await actions.deactivateUser(undefined, form({ userId: student.id }));
    expect((await db.user.findUnique({ where: { id: student.id } }))!.deactivatedAt).toEqual(first);
  });

  it("will not reactivate an account approved for deletion", async () => {
    const student = await user("student", { active: false, deletionRequestedAt: new Date(), deletionApprovedAt: new Date() });
    expect(await actions.reactivateUser(undefined, form({ userId: student.id }))).toEqual({ error: "cannotReactivate" });
    const other = await user("student", { active: false });
    expect(await actions.reactivateUser(undefined, form({ userId: other.id }))).toEqual({ ok: "userReactivated" });
  });

  it("approves a deletion only if the student asked for it, and only for students", async () => {
    const asked = await user("student", { deletionRequestedAt: new Date() });
    const notAsked = await user("student");
    const teacher = await user("teacher", { deletionRequestedAt: new Date() });
    expect(await actions.approveDeletion(undefined, form({ userId: notAsked.id }))).toEqual({ error: "deletionNotRequested" });
    expect(await actions.approveDeletion(undefined, form({ userId: teacher.id }))).toEqual({ error: "deletionNotRequested" });
    expect(await actions.approveDeletion(undefined, form({ userId: asked.id }))).toEqual({ ok: "deletionApproved" });
    expect(await db.user.findUnique({ where: { id: asked.id } })).toMatchObject({ active: false, sessionVersion: 1 });
    // Approving twice is refused, not repeated.
    expect(await actions.approveDeletion(undefined, form({ userId: asked.id }))).toEqual({ error: "deletionNotRequested" });
  });

  it("changing an email invalidates reset links sent to the old address", async () => {
    const student = await user("student");
    await db.authToken.create({ data: { userId: student.id, tokenHash: "h", type: "reset", expiresAt: new Date(Date.now() + 3_600_000) } });
    await actions.updateUser(undefined, form({ userId: student.id, name: "S", email: "changed@x.az" }));
    expect(await db.authToken.count({ where: { userId: student.id } })).toBe(0);
  });
});

describe("student import", () => {
  async function group(name: string) {
    const term = await db.term.create({ data: { name: "T", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31") } });
    const teacher = await user("teacher");
    const course = await db.course.create({ data: { title: "C" } });
    return db.group.create({ data: { name, courseId: course.id, teacherId: teacher.id, termId: term.id } });
  }

  it("creates accounts + enrolments atomically, with temporary passwords, skipping existing people", async () => {
    const g = await group("A1");
    await user("student", { email: "old@x.az" });
    const csv = "name,email,group\nOld,old@x.az,A1\nAli,ali@x.az,A1\nVera,vera@x.az,A1";
    const r = await actions.applyStudentImport(undefined, form({ csv }));
    expect(r).toMatchObject({ skipped: 1 });
    expect(r!.created!.map((c) => c.email)).toEqual(["ali@x.az", "vera@x.az"]);
    expect(await db.enrollment.count({ where: { groupId: g.id } })).toBe(2);
    expect(await db.user.count({ where: { role: "student", mustChangePassword: true } })).toBe(2);
  });

  it("applies nothing at all if any row has a problem", async () => {
    await group("A1");
    const r = await actions.applyStudentImport(undefined, form({ csv: "name,email,group\nAli,ali@x.az,A1\nBad,not-an-email,A1" }));
    expect(r).toEqual({ error: "importChanged" });
    expect(await db.user.count({ where: { role: "student" } })).toBe(0);
  });

  it("is idempotent: importing the same list twice creates nobody the second time", async () => {
    await group("A1");
    const csv = "name,email,group\nAli,ali@x.az,A1";
    await actions.applyStudentImport(undefined, form({ csv }));
    expect(await actions.applyStudentImport(undefined, form({ csv }))).toEqual({ error: "importNothing" });
    expect(await db.user.count({ where: { role: "student" } })).toBe(1);
  });
});

describe("terms", () => {
  const term = (over: Record<string, string> = {}) => form({ name: "Fall", startDate: "2026-09-01", endDate: "2026-12-31", ...over });

  it("creates a term and redirects to the list", async () => {
    expect(await redirectsTo(actions.saveTerm(undefined, term()))).toBe("/en/terms");
    expect(await db.term.findMany()).toMatchObject([{ name: "Fall" }]);
  });

  it("rejects impossible, reversed and absurdly long terms", async () => {
    expect(await actions.saveTerm(undefined, term({ startDate: "2026-02-30" }))).toEqual({ error: "termDates" });
    expect(await actions.saveTerm(undefined, term({ endDate: "2026-09-01" }))).toEqual({ error: "termDates" });
    expect(await actions.saveTerm(undefined, term({ endDate: "2026-08-01" }))).toEqual({ error: "termDates" });
    expect(await actions.saveTerm(undefined, term({ endDate: "2028-01-01" }))).toEqual({ error: "termTooLong" });
    expect(await actions.saveTerm(undefined, term({ name: "  " }))).toEqual({ error: "termName" });
    expect(await db.term.count()).toBe(0);
  });

  it("will not shrink a term past lessons that already exist, nor edit a locked term", async () => {
    await redirectsTo(actions.saveTerm(undefined, term()));
    const t = (await db.term.findFirst())!;
    const teacher = await user("teacher");
    const course = await db.course.create({ data: { title: "C" } });
    const g = await db.group.create({ data: { name: "A", courseId: course.id, teacherId: teacher.id, termId: t.id } });
    await db.lesson.create({ data: { groupId: g.id, teacherId: teacher.id, startsAt: new Date("2026-12-20T10:00:00Z"), endsAt: new Date("2026-12-20T11:00:00Z") } });

    expect(await actions.saveTerm(undefined, term({ termId: t.id, endDate: "2026-12-01" }))).toEqual({ error: "termLessonsOutside" });
    expect(await redirectsTo(actions.saveTerm(undefined, term({ termId: t.id, endDate: "2027-01-15" })))).toBe("/en/terms");

    await actions.setTermLocked(undefined, form({ termId: t.id, locked: "true" }));
    expect(await actions.saveTerm(undefined, term({ termId: t.id, name: "Renamed" }))).toEqual({ error: "termLocked" });
  });

  it("locking and reopening round-trips; unknown term is reported", async () => {
    await redirectsTo(actions.saveTerm(undefined, term()));
    const t = (await db.term.findFirst())!;
    expect(await actions.setTermLocked(undefined, form({ termId: t.id, locked: "true" }))).toEqual({ ok: "termClosed" });
    expect((await db.term.findUnique({ where: { id: t.id } }))!.locked).toBe(true);
    expect(await actions.setTermLocked(undefined, form({ termId: t.id, locked: "false" }))).toEqual({ ok: "termReopened" });
    expect(await actions.setTermLocked(undefined, form({ termId: "nope", locked: "true" }))).toEqual({ error: "termNotFound" });
  });
});

describe("final grades", () => {
  async function setup() {
    const term = await db.term.create({ data: { name: "T", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31") } });
    const teacher = await user("teacher");
    const s1 = await user("student");
    const s2 = await user("student");
    const course = await db.course.create({ data: { title: "C" } });
    const group = await db.group.create({ data: { name: "A", courseId: course.id, teacherId: teacher.id, termId: term.id } });
    await db.enrollment.createMany({ data: [{ groupId: group.id, studentId: s1.id }, { groupId: group.id, studentId: s2.id }] });
    return { term, group, s1, s2 };
  }
  const grades = (w: Awaited<ReturnType<typeof setup>>, intent: string, v1: string, v2 = "") =>
    form({ groupId: w.group.id, intent, [`value:${w.s1.id}`]: v1, [`value:${w.s2.id}`]: v2 });

  it("saves drafts hidden from students, then publishes", async () => {
    const w = await setup();
    expect(await actions.saveFinalGrades(undefined, grades(w, "save", "88.46", "70"))).toEqual({ ok: "gradesSaved" });
    expect(await db.finalGrade.findMany({ orderBy: { value: "desc" } })).toMatchObject([{ value: 88.5, published: false }, { value: 70, published: false }]);
    expect(await actions.saveFinalGrades(undefined, grades(w, "publish", "88.5", "70"))).toEqual({ ok: "gradesPublished" });
    expect(await db.finalGrade.count({ where: { published: true } })).toBe(2);
    expect(await actions.saveFinalGrades(undefined, grades(w, "unpublish", "", ""))).toEqual({ ok: "gradesUnpublished" });
    expect(await db.finalGrade.count({ where: { published: true } })).toBe(0);
  });

  it("clearing a box removes that student's grade; bad values change nothing", async () => {
    const w = await setup();
    await actions.saveFinalGrades(undefined, grades(w, "save", "80", "90"));
    await actions.saveFinalGrades(undefined, grades(w, "save", "80", ""));
    expect(await db.finalGrade.count()).toBe(1);
    for (const bad of ["101", "-1", "abc"]) {
      expect(await actions.saveFinalGrades(undefined, grades(w, "save", bad))).toEqual({ error: "finalValue" });
    }
    expect(await actions.saveFinalGrades(undefined, grades(w, "bogus", "80"))).toEqual({ error: "finalValue" });
    expect(await actions.saveFinalGrades(undefined, grades(w, "publish", "", ""))).toEqual({ error: "finalNone" });
    expect(await db.finalGrade.findMany()).toMatchObject([{ value: 80 }]);
  });

  it("a locked term is read-only", async () => {
    const w = await setup();
    await actions.saveFinalGrades(undefined, grades(w, "save", "80"));
    await actions.setTermLocked(undefined, form({ termId: w.term.id, locked: "true" }));
    expect(await actions.saveFinalGrades(undefined, grades(w, "save", "10"))).toEqual({ error: "termLocked" });
    expect(await actions.saveFinalGrades(undefined, grades(w, "publish", "10"))).toEqual({ error: "termLocked" });
    expect(await db.finalGrade.findMany()).toMatchObject([{ value: 80, published: false }]);
  });

  it("only students enrolled (or already graded) can receive a grade", async () => {
    const w = await setup();
    const outsider = await user("student");
    await actions.saveFinalGrades(undefined, form({ groupId: w.group.id, intent: "save", [`value:${outsider.id}`]: "99" }));
    expect(await db.finalGrade.count({ where: { studentId: outsider.id } })).toBe(0);
  });
});
