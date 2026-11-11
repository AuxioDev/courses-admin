// What happens when a teacher's action notifies a student: stored once, delivered the way the student chose, in their
// language, with links that open the Student Diary (not this app).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ emails: [] as { to: string; subject: string; html: string; text: string }[], pushes: [] as { userId: string; message: Record<string, string> }[], emailOk: true }));

vi.mock("../email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../email")>()),
  sendEmail: vi.fn(async (m: { to: string; subject: string; html: string; text: string }) => {
    sent.emails.push(m);
    return sent.emailOk;
  }),
}));
vi.mock("../push", () => ({ sendPush: vi.fn(async (userId: string, message: Record<string, string>) => void sent.pushes.push({ userId, message })) }));
vi.mock("@/i18n", async () => {
  const { az } = await import("@/i18n/dictionaries/az");
  const { en } = await import("@/i18n/dictionaries/en");
  const { ru } = await import("@/i18n/dictionaries/ru");
  const { fmt } = await import("@/i18n/format");
  return { getDictionary: (l: "az" | "en" | "ru") => ({ az, en, ru })[l], fmt };
});

import { db } from "../db";
import { notify } from "../notifications/notify";
import { createWorld, resetDatabase } from "../../../test/db";

const STUDENT_APP = "https://diary.example";
const deadline = { homeworkId: "h1", homeworkTitle: "Essay", course: "Math", dueAt: "2026-11-20T10:00:00.000Z" };
const mark = { course: "Math", markType: "quiz" as const, value: 90 };

async function student(extra: Record<string, unknown> = {}) {
  const w = await createWorld();
  return db.user.update({ where: { id: w.student.id }, data: { name: "Aysel Mammadova", ...extra } });
}

beforeEach(async () => {
  vi.stubEnv("STUDENT_APP_URL", STUDENT_APP);
  await resetDatabase();
  sent.emails.length = 0;
  sent.pushes.length = 0;
  sent.emailOk = true;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("notify (real database)", () => {
  it("stores the notification, emails what a student should not miss, in their language, and records that it was sent", async () => {
    const s = await student({ locale: "ru" });
    expect(await notify(s.id, "deadline", deadline)).toBe(true);

    const stored = await db.notification.findFirstOrThrow();
    expect(stored).toMatchObject({ userId: s.id, type: "deadline", readAt: null });
    expect(sent.emails).toHaveLength(1);
    const [mail] = sent.emails;
    expect(mail.to).toBe(s.email);
    expect(mail.subject).toMatch(/[А-Яа-я]/);
    expect(mail.text + mail.html).toContain("Aysel"); // first name only
    expect(mail.text + mail.html).not.toContain("Mammadova");
    expect(mail.html).toContain(`${STUDENT_APP}/ru/homework/h1`);
    expect(stored.emailedAt).toBeInstanceOf(Date);
  });

  it("pushes to the student's devices by default, with a link and the notification as the tag", async () => {
    const s = await student({ locale: "en" });
    await notify(s.id, "new_mark", mark);
    expect(sent.pushes).toHaveLength(1);
    expect(sent.pushes[0]).toMatchObject({ userId: s.id, message: { url: `${STUDENT_APP}/en/marks` } });
    expect(sent.pushes[0].message.tag).toBe((await db.notification.findFirstOrThrow()).id);
    expect(sent.emails).toEqual([]); // a mark is not emailed unless asked
  });

  it("delivers only once for the same event, however many times it is raised", async () => {
    const s = await student();
    expect(await notify(s.id, "deadline", deadline, { dedupeKey: "deadline:h1" })).toBe(true);
    expect(await notify(s.id, "deadline", deadline, { dedupeKey: "deadline:h1" })).toBe(false);
    expect(await db.notification.count()).toBe(1);
    expect(sent.emails).toHaveLength(1);
    expect(sent.pushes).toHaveLength(1);
    // A different key, or no key at all, is a different event.
    expect(await notify(s.id, "deadline", deadline, { dedupeKey: "deadline:h2" })).toBe(true);
    expect(await notify(s.id, "deadline", deadline)).toBe(true);
    expect(await notify(s.id, "deadline", deadline)).toBe(true);
    expect(await db.notification.count()).toBe(4);
  });

  it("keeps the same key apart between students", async () => {
    const a = await student();
    const b = await db.user.create({ data: { name: "B", email: "b@t.local", passwordHash: "x", role: "student" } });
    expect(await notify(a.id, "deadline", deadline, { dedupeKey: "k" })).toBe(true);
    expect(await notify(b.id, "deadline", deadline, { dedupeKey: "k" })).toBe(true);
  });

  it("follows the student's own choices over the defaults, per type and per channel", async () => {
    const s = await student();
    await db.notificationPreference.createMany({
      data: [
        { userId: s.id, type: "new_mark", email: true, push: false }, // wants marks by email, not on the phone
        { userId: s.id, type: "deadline", email: false, push: true }, // does not want deadline emails
      ],
    });
    await notify(s.id, "new_mark", mark);
    await notify(s.id, "deadline", deadline);
    expect(sent.emails.map((m) => m.subject)).toHaveLength(1);
    expect(sent.pushes).toHaveLength(1);
    expect(sent.pushes[0].message.url).toContain("/homework/h1");
  });

  it("stores the notification but sends nothing when both channels are off", async () => {
    const s = await student();
    await db.notificationPreference.create({ data: { userId: s.id, type: "deadline", email: false, push: false } });
    expect(await notify(s.id, "deadline", deadline)).toBe(true);
    expect(await db.notification.count()).toBe(1);
    expect(sent.emails).toEqual([]);
    expect(sent.pushes).toEqual([]);
  });

  it("sends nothing to a deactivated student, but does not fail", async () => {
    const s = await student({ active: false });
    expect(await notify(s.id, "deadline", deadline)).toBe(true);
    expect(sent.emails).toEqual([]);
    expect(sent.pushes).toEqual([]);
  });

  it("does not claim an email was sent when the sender could not send it", async () => {
    const s = await student();
    sent.emailOk = false;
    await notify(s.id, "deadline", deadline);
    expect(sent.emails).toHaveLength(1);
    expect((await db.notification.findFirstOrThrow()).emailedAt).toBeNull();
  });

  it("uses the default language for a student who has not chosen one", async () => {
    const s = await student({ locale: null });
    await notify(s.id, "deadline", deadline);
    expect(sent.pushes[0].message.url).toMatch(/^https:\/\/diary\.example\/az\//);
  });
});
