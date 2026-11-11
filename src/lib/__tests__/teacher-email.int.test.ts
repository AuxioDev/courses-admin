// The email a teacher gets when the schedule changes under them.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ emails: [] as { to: string; subject: string; html: string; text: string }[], failFor: new Set<string>(), jobs: [] as (() => Promise<void>)[] }));
vi.mock("../email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../email")>()),
  sendEmail: vi.fn(async (m: { to: string; subject: string; html: string; text: string }) => {
    if (sent.failFor.has(m.to)) throw new Error("provider down");
    sent.emails.push(m);
    return true;
  }),
}));
vi.mock("next/server", () => ({ after: (job: () => Promise<void>) => void sent.jobs.push(job) }));
vi.mock("@/i18n", async () => {
  const { az } = await import("@/i18n/dictionaries/az");
  const { en } = await import("@/i18n/dictionaries/en");
  const { ru } = await import("@/i18n/dictionaries/ru");
  const { fmt } = await import("@/i18n/format");
  return { getDictionary: (l: "az" | "en" | "ru") => ({ az, en, ru })[l], fmt };
});

import { db } from "../db";
import { emailTeachers, type TeacherNotice } from "../notifications/teacher-email";
import { resetDatabase } from "../../../test/db";

let n = 0;
const teacher = (extra: Record<string, unknown> = {}) =>
  db.user.create({ data: { name: "Leyla Mammadova", email: `t${++n}@t.local`, passwordHash: "x", role: "teacher", locale: "en", timezone: "Asia/Baku", ...extra } });
const flush = async () => {
  for (const job of sent.jobs.splice(0)) await job();
};
const at = new Date("2026-11-12T10:00:00Z"); // 14:00 in Baku

beforeEach(async () => {
  await resetDatabase();
  sent.emails.length = 0;
  sent.failFor.clear();
  sent.jobs.length = 0;
  vi.stubEnv("TEACHER_APP_URL", "https://teachers.example");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("emailTeachers", () => {
  it("does nothing until the response has been sent", async () => {
    const t = await teacher();
    emailTeachers([{ teacherId: t.id, notice: { kind: "cancelled", course: "Math", group: "A1", at } }]);
    expect(sent.emails).toEqual([]);
    await flush();
    expect(sent.emails).toHaveLength(1);
  });

  const notices: TeacherNotice[] = [
    { kind: "moved", course: "Math", group: "A1", at, newAt: new Date("2026-11-13T12:00:00Z") },
    { kind: "cancelled", course: "Math", group: "A1", at },
    { kind: "restored", course: "Math", group: "A1", at },
    { kind: "assigned", course: "Math", group: "A1", at },
    { kind: "unassigned", course: "Math", group: "A1", at },
    { kind: "added", course: "Math", group: "A1", at },
    { kind: "groupAssigned", course: "Math", group: "A1" },
    { kind: "groupUnassigned", course: "Math", group: "A1" },
    { kind: "schedule", course: "Math", group: "A1", day: "2026-11-16" },
  ];

  it.each(notices.map((notice) => [notice.kind, notice] as const))("a '%s' notice is a finished email that names the course and group", async (_kind, notice) => {
    const t = await teacher();
    emailTeachers([{ teacherId: t.id, notice }]);
    await flush();
    const [mail] = sent.emails;
    expect(mail.to).toBe(t.email);
    for (const part of [mail.subject, mail.text]) {
      expect(part).not.toMatch(/\{\w+\}|undefined|NaN|Invalid Date/);
    }
    expect(mail.subject + mail.text).toContain("Math");
    expect(mail.subject + mail.text).toContain("A1");
  });

  it("shows the old and new time in the teacher's own timezone", async () => {
    const t = await teacher({ timezone: "Asia/Baku" });
    emailTeachers([{ teacherId: t.id, notice: { kind: "moved", course: "Math", group: "A1", at, newAt: new Date("2026-11-13T12:00:00Z") } }]);
    await flush();
    const text = sent.emails[0].subject + sent.emails[0].text;
    expect(text).toMatch(/14:00/); // 10:00Z in Baku
    expect(text).toMatch(/16:00/); // 12:00Z in Baku
  });

  it("links to the Teacher App's lessons, in the teacher's language, and greets them by first name", async () => {
    const t = await teacher({ locale: "ru" });
    emailTeachers([{ teacherId: t.id, notice: { kind: "cancelled", course: "Math", group: "A1", at } }]);
    await flush();
    const [mail] = sent.emails;
    expect(mail.text).toContain("https://teachers.example/ru/lessons");
    expect(mail.subject).toMatch(/[А-Яа-я]/);
    expect(mail.html + mail.text).toContain("Leyla");
    expect(mail.html + mail.text).not.toContain("Mammadova");
  });

  it("sends nothing to a deactivated teacher or one that does not exist, and carries on with the rest", async () => {
    const gone = await teacher({ active: false });
    const ok = await teacher();
    emailTeachers([
      { teacherId: gone.id, notice: { kind: "cancelled", course: "Math", group: "A1", at } },
      { teacherId: "nobody", notice: { kind: "cancelled", course: "Math", group: "A1", at } },
      { teacherId: ok.id, notice: { kind: "cancelled", course: "Math", group: "A1", at } },
    ]);
    await flush();
    expect(sent.emails.map((m) => m.to)).toEqual([ok.email]);
  });

  it("does not let one failure stop the rest, and logs only what kind of failure it was", async () => {
    const a = await teacher();
    const b = await teacher();
    sent.failFor.add(a.email);
    emailTeachers([
      { teacherId: a.id, notice: { kind: "cancelled", course: "Math", group: "A1", at } },
      { teacherId: b.id, notice: { kind: "cancelled", course: "Math", group: "A1", at } },
    ]);
    await flush();
    expect(sent.emails.map((m) => m.to)).toEqual([b.email]);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("Error");
    expect(logged).not.toContain(a.email);
    expect(logged).not.toContain("provider down");
  });
});
