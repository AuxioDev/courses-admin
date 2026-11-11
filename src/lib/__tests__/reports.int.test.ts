// The four admin reports, and the CSV download that mirrors them.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ admin: { id: "a", name: "Admin" } as { id: string; name: string } | null }));
vi.mock("@/lib/auth", () => ({ getAdminOrNull: async () => auth.admin, getCurrentAdmin: async () => auth.admin }));
vi.mock("@/i18n", async () => {
  const { az } = await import("@/i18n/dictionaries/az");
  const { en } = await import("@/i18n/dictionaries/en");
  const { ru } = await import("@/i18n/dictionaries/ru");
  return { getDictionary: (l: "az" | "en" | "ru") => ({ az, en, ru })[l] };
});

import { en as t } from "@/i18n/dictionaries/en";
import { db } from "../db";
import { buildReport, resolveReportFilters, type Report } from "../reports";
import { GET } from "@/app/api/reports/route";
import { createWorld, daysFromNow, resetDatabase } from "../../../test/db";

const HOUR = 3_600_000;
let n = 0;
const user = (name: string, role: "student" | "teacher" = "student", extra: Record<string, unknown> = {}) =>
  db.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W/g, "")}${++n}@t.local`, passwordHash: "x", role, ...extra } });
const lesson = (groupId: string, teacherId: string, hoursAgo: number, extra: Record<string, unknown> = {}) =>
  db.lesson.create({ data: { groupId, teacherId, startsAt: new Date(Date.now() - hoursAgo * HOUR), endsAt: new Date(Date.now() - (hoursAgo - 1) * HOUR), ...extra } });
const build = async (params: Record<string, unknown>) => buildReport(await resolveReportFilters(params), t);
// Reads one cell by its column heading so the tests don't depend on column order.
const col = (r: Report, row: number, header: string) => r.rows[row][r.headers.indexOf(header)];
const rowOf = (r: Report, student: string) => r.rows.findIndex((x) => x[0].text.startsWith(student));

beforeEach(async () => {
  await resetDatabase();
  auth.admin = { id: "a", name: "Admin" };
});
afterAll(() => db.$disconnect());

describe("resolveReportFilters", () => {
  it("falls back to the attendance report and the current term", async () => {
    const w = await createWorld();
    const f = await resolveReportFilters({ type: "bogus", term: "nope", group: "nope" });
    expect(f.type).toBe("attendance");
    expect(f.term?.id).toBe(w.term.id);
    expect(f.groupId).toBeNull();
  });

  it("returns no term at all in an empty school", async () => {
    expect((await resolveReportFilters({})).term).toBeNull();
  });

  it("ignores a group that belongs to another term", async () => {
    const w = await createWorld();
    const old = await db.term.create({ data: { name: "Old", startDate: daysFromNow(-400), endDate: daysFromNow(-300) } });
    const g2 = await db.group.create({ data: { name: "Z9", courseId: w.course.id, teacherId: w.teacher.id, termId: old.id } });
    const f = await resolveReportFilters({ term: w.term.id, group: g2.id });
    expect(f.groupId).toBeNull();
    expect(f.groups.map((g) => g.id)).toEqual([w.group.id]);
    expect((await resolveReportFilters({ term: old.id, group: g2.id })).groupId).toBe(g2.id);
  });
});

describe("attendance report", () => {
  it("counts each status and treats late as attended and excused as not counted", async () => {
    const w = await createWorld();
    const lessons = await Promise.all([5, 4, 3, 2].map((h) => lesson(w.group.id, w.teacher.id, h)));
    for (const [i, status] of (["present", "late", "absent", "excused"] as const).entries()) {
      await db.attendance.create({ data: { lessonId: lessons[i].id, studentId: w.student.id, status } });
    }
    const r = await build({});
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].slice(0, 3).map((c) => c.text)).toEqual(["Student", "Math", "A1"]);
    expect(["present", "late", "absent", "excused"].map((s) => col(r, 0, t.reports[s as "present"]).text)).toEqual(["1", "1", "1", "1"]);
    expect(col(r, 0, t.reports.attendanceRate).text).toBe("67%"); // 2 of 3 counted
  });

  it("shows a dash and no warning for a student with no lessons yet, a bad tone below the risk line", async () => {
    const w = await createWorld();
    const b = await user("Bea");
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: b.id } });
    const l = await lesson(w.group.id, w.teacher.id, 2);
    await db.attendance.create({ data: { lessonId: l.id, studentId: b.id, status: "absent" } });
    const r = await build({});
    const rate = (name: string) => col(r, rowOf(r, name), t.reports.attendanceRate);
    expect(rate("Student")).toEqual({ text: "—", tone: undefined });
    expect(rate("Bea")).toEqual({ text: "0%", tone: "bad" });
  });

  it("marks people who left the group, and keeps their history in the report", async () => {
    const w = await createWorld();
    const gone = await user("Gone");
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: gone.id, status: "dropped" } });
    const off = await user("Off", "student", { active: false });
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: off.id } });
    const r = await build({});
    expect(r.rows.map((x) => x[0].text).sort()).toEqual([`Gone (${t.reports.left})`, `Off (${t.reports.left})`, "Student"]);
  });

  it("can be narrowed to one group, and only reports the chosen term", async () => {
    const w = await createWorld();
    const other = await db.group.create({ data: { name: "B2", courseId: w.course.id, teacherId: w.teacher.id, termId: w.term.id } });
    const s2 = await user("Sam");
    await db.enrollment.create({ data: { groupId: other.id, studentId: s2.id } });
    expect((await build({})).rows.map((x) => x[0].text).sort()).toEqual(["Sam", "Student"]);
    expect((await build({ group: other.id })).rows.map((x) => x[0].text)).toEqual(["Sam"]);
    const old = await db.term.create({ data: { name: "Old", startDate: daysFromNow(-400), endDate: daysFromNow(-300) } });
    expect((await build({ term: old.id })).rows).toEqual([]);
  });

  it("orders by group, then by student", async () => {
    const w = await createWorld();
    const b = await db.group.create({ data: { name: "A0", courseId: w.course.id, teacherId: w.teacher.id, termId: w.term.id } });
    const z = await user("Zed");
    const a = await user("Abe");
    await db.enrollment.create({ data: { groupId: b.id, studentId: z.id } });
    await db.enrollment.create({ data: { groupId: b.id, studentId: a.id } });
    expect((await build({})).rows.map((x) => `${x[2].text}/${x[0].text}`)).toEqual(["A0/Abe", "A0/Zed", "A1/Student"]);
  });
});

describe("marks report", () => {
  it("weights the average, bands it, and shows draft or published final grades", async () => {
    const w = await createWorld();
    const b = await user("Bea");
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: b.id } });
    const mark = (studentId: string, value: number, weight: number, type: "classwork" | "exam") =>
      db.mark.create({ data: { studentId, groupId: w.group.id, type, value, weight, createdBy: w.teacher.id } });
    await mark(w.student.id, 80, 1, "classwork");
    await mark(w.student.id, 40, 3, "exam");
    await mark(b.id, 95, 1, "classwork");
    await db.finalGrade.create({ data: { studentId: w.student.id, groupId: w.group.id, termId: w.term.id, value: 55, published: false } });
    await db.finalGrade.create({ data: { studentId: b.id, groupId: w.group.id, termId: w.term.id, value: 95, published: true } });
    const r = await build({ type: "marks" });
    const s = rowOf(r, "Student");
    const be = rowOf(r, "Bea");
    expect(col(r, s, t.reports.marks).text).toBe("2");
    expect(col(r, s, t.reports.average)).toEqual({ text: "50.0", tone: "bad" });
    expect(col(r, s, t.reports.finalGrade).text).toBe("55");
    expect(col(r, s, t.reports.finalState).text).toBe(t.grades.draft);
    expect(col(r, be, t.reports.average)).toEqual({ text: "95.0", tone: "good" });
    expect(col(r, be, t.reports.finalState).text).toBe(t.grades.published);
  });

  it("shows dashes, not zeros, where there is nothing yet", async () => {
    await createWorld();
    const r = await build({ type: "marks" });
    expect(col(r, 0, t.reports.marks).text).toBe("0");
    expect(col(r, 0, t.reports.average)).toEqual({ text: "—", tone: undefined });
    expect(col(r, 0, t.reports.finalGrade).text).toBe("—");
    expect(col(r, 0, t.reports.finalState).text).toBe("—");
  });
});

describe("homework report", () => {
  it("counts hand-ins, late ones, graded, returned and missed, but not work that is not due yet", async () => {
    const w = await createWorld(); // HW 1 is due in two weeks
    const hw = (title: string, days: number) => db.homework.create({ data: { groupId: w.group.id, title, dueAt: new Date(Date.now() + days * 86_400_000), maxScore: 10 } });
    const [h2, h3, h4, h5] = [await hw("H2", -3), await hw("H3", -3), await hw("H4", -3), await hw("H5", -3)];
    const handIn = async (homeworkId: string, status: "submitted" | "graded" | "returned", lateAttempts: boolean[]) => {
      const s = await db.submission.create({ data: { homeworkId, studentId: w.student.id, status } });
      for (const [i, late] of lateAttempts.entries()) await db.submissionAttempt.create({ data: { submissionId: s.id, number: i + 1, late } });
    };
    await handIn(h2.id, "graded", [false]);
    await handIn(h3.id, "returned", [true, false]); // handed in late first, fixed on time: the latest attempt counts
    await handIn(w.homework.id, "submitted", [true]);
    // h4 and h5 are overdue with nothing handed in; the first-listed homework (due later) is handed in.
    const r = await build({ type: "homework" });
    expect(col(r, 0, t.reports.handedIn).text).toBe("3");
    expect(col(r, 0, t.reports.handedInLate).text).toBe("1");
    expect(col(r, 0, t.reports.graded).text).toBe("1");
    expect(col(r, 0, t.reports.returned).text).toBe("1");
    expect(col(r, 0, t.reports.missed)).toEqual({ text: "2", tone: "warn" });
    void h4; void h5;
  });

  it("does not count work that is not due yet as missed", async () => {
    await createWorld();
    const r = await build({ type: "homework" });
    expect(col(r, 0, t.reports.missed)).toEqual({ text: "0", tone: undefined });
  });

  it("never reads what students wrote or uploaded", async () => {
    const w = await createWorld();
    const s = await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.student.id, content: "SECRET ESSAY", links: ["https://secret.example"] } });
    await db.submissionAttempt.create({ data: { submissionId: s.id, number: 1, content: "SECRET ESSAY", feedback: "SECRET FEEDBACK" } });
    const r = await build({ type: "homework" });
    expect(JSON.stringify(r)).not.toMatch(/SECRET|secret\.example/);
  });
});

describe("teachers report", () => {
  it("counts lessons held, unmarked lessons, homework, marks given and review turnaround per teacher", async () => {
    const w = await createWorld();
    const t2 = await user("Zoe", "teacher");
    const g2 = await db.group.create({ data: { name: "B2", courseId: w.course.id, teacherId: t2.id, termId: w.term.id } });
    // Teacher: one lesson taken (attendance), one in the past with no attendance, one cancelled, one in the future.
    const held = await lesson(w.group.id, w.teacher.id, 10);
    await db.attendance.create({ data: { lessonId: held.id, studentId: w.student.id, status: "present" } });
    await lesson(w.group.id, w.teacher.id, 6);
    await lesson(w.group.id, w.teacher.id, 4, { status: "cancelled" });
    await db.lesson.create({ data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: new Date(Date.now() + 5 * HOUR), endsAt: new Date(Date.now() + 6 * HOUR) } });
    await lesson(g2.id, t2.id, 3, { status: "done" });
    await db.mark.create({ data: { studentId: w.student.id, groupId: w.group.id, type: "exam", value: 90, createdBy: w.teacher.id } });
    // Two attempts reviewed after 2h and 4h, one submission still waiting.
    const submittedAt = new Date(Date.now() - 10 * HOUR);
    const a = await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.student.id, status: "graded" } });
    await db.submissionAttempt.create({ data: { submissionId: a.id, number: 1, submittedAt, reviewedAt: new Date(submittedAt.getTime() + 2 * HOUR) } });
    await db.submissionAttempt.create({ data: { submissionId: a.id, number: 2, submittedAt, reviewedAt: new Date(submittedAt.getTime() + 4 * HOUR) } });
    const s2 = await user("Sam");
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: s2.id } });
    await db.submission.create({ data: { homeworkId: w.homework.id, studentId: s2.id, status: "submitted" } });

    const r = await build({ type: "teachers" });
    expect(r.rows.map((x) => x[0].text)).toEqual(["Teacher", "Zoe"]); // sorted by name
    const mine = (h: string) => col(r, 0, h).text;
    expect(mine(t.reports.groups)).toBe("1");
    expect(mine(t.reports.lessonsHeld)).toBe("1");
    expect(col(r, 0, t.reports.lessonsNotMarked)).toEqual({ text: "1", tone: "warn" });
    expect(mine(t.reports.homeworkGiven)).toBe("1");
    expect(mine(t.reports.marksGiven)).toBe("1");
    expect(mine(t.reports.reviewed)).toBe("2");
    expect(mine(t.reports.waiting)).toBe("1");
    expect(mine(t.reports.reviewHours)).toBe("3.0");
    expect(col(r, 1, t.reports.lessonsHeld).text).toBe("1"); // status "done"
    expect(col(r, 1, t.reports.lessonsNotMarked)).toEqual({ text: "0", tone: undefined });
    expect(col(r, 1, t.reports.reviewHours).text).toBe("—");
  });
});

describe("GET /api/reports", () => {
  const get = (qs = "") => GET(new Request(`http://localhost/api/reports${qs}`));

  it("refuses anyone who is not an admin", async () => {
    await createWorld();
    auth.admin = null;
    expect((await get()).status).toBe(401);
  });

  it("is 404 when the school has no term", async () => {
    expect((await get()).status).toBe(404);
  });

  it("downloads the same rows as a spreadsheet-safe CSV that is never cached", async () => {
    await createWorld();
    await db.user.update({ where: { email: (await db.user.findFirstOrThrow({ where: { role: "student" } })).email }, data: { name: "=SUM(A1)" } });
    const res = await get("?type=marks&lang=en");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="marks-report.csv"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // the byte order mark Excel needs for az and ru letters
    const body = await res.text();
    expect(body).toContain(`${t.reports.student},${t.reports.course}`);
    expect(body).toContain("'=SUM(A1)");
    expect(body).not.toMatch(/(^|,)=SUM/m);
  });

  it("writes the headers in the requested language and falls back to the default for an unknown one", async () => {
    await createWorld();
    const { az } = await import("@/i18n/dictionaries/az");
    expect(await (await get("?lang=az")).text()).toContain(az.reports.student);
    expect(await (await get("?lang=xx")).text()).toContain((await import("@/i18n/config")).defaultLocale === "az" ? az.reports.student : t.reports.student);
  });

  it("uses a safe file name even when the type is junk", async () => {
    await createWorld();
    const res = await get('?type="><script>');
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="attendance-report.csv"');
  });
});
