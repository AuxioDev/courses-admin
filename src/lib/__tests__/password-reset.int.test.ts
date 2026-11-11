// Two ways a reset link is sent: an admin asks for their own, or an admin sends one to a student or a teacher.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ emails: [] as { to: string; subject: string; html: string; text: string }[], ok: true }));
vi.mock("../email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../email")>()),
  sendEmail: vi.fn(async (m: { to: string; subject: string; html: string; text: string }) => {
    sent.emails.push(m);
    return sent.ok;
  }),
}));
vi.mock("@/i18n", async () => {
  const { az } = await import("@/i18n/dictionaries/az");
  const { en } = await import("@/i18n/dictionaries/en");
  const { ru } = await import("@/i18n/dictionaries/ru");
  const { fmt } = await import("@/i18n/format");
  return { getDictionary: (l: "az" | "en" | "ru") => ({ az, en, ru })[l], fmt };
});

import { db } from "../db";
import { APP_URL } from "../email";
import { hashToken } from "../passwords";
import { appUrlFor, emailResetLinkTo, sendResetLink } from "../password-reset";
import { resetDatabase } from "../../../test/db";

let n = 0;
const person = (role: "student" | "teacher" | "admin", extra: Record<string, unknown> = {}) =>
  db.user.create({ data: { name: "Aysel Mammadova", email: `p${++n}@t.local`, passwordHash: "x", role, ...extra } });
const tokenOf = (mail: { text: string }) => /token=([\w-]+)/.exec(mail.text)![1];

beforeEach(async () => {
  await resetDatabase();
  sent.emails.length = 0;
  sent.ok = true;
  vi.stubEnv("STUDENT_APP_URL", "https://diary.example/");
  vi.stubEnv("TEACHER_APP_URL", "https://teachers.example");
  vi.stubEnv("VERCEL", "");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("sendResetLink (an admin forgot their password)", () => {
  it("emails a one-time link to the Admin Panel in the admin's language, valid for an hour, stored only as a hash", async () => {
    const u = await person("admin", { locale: "ru" });
    const before = Date.now();
    await sendResetLink(u.email);
    expect(sent.emails).toHaveLength(1);
    const [mail] = sent.emails;
    expect(mail.to).toBe(u.email);
    expect(mail.subject).toMatch(/[А-Яа-я]/);
    expect(mail.text).toContain(`${APP_URL}/ru/reset-password?token=`);
    const row = await db.authToken.findFirstOrThrow();
    expect(row).toMatchObject({ userId: u.id, type: "reset", usedAt: null, tokenHash: hashToken(tokenOf(mail)) });
    expect(JSON.stringify(row)).not.toContain(tokenOf(mail));
    expect((row.expiresAt.getTime() - before) / 60_000).toBeGreaterThan(59);
  });

  it("does nothing for an unknown address, a deactivated admin, or a student or teacher", async () => {
    await sendResetLink("nobody@t.local");
    for (const u of [await person("admin", { active: false }), await person("student"), await person("teacher")]) await sendResetLink(u.email);
    expect(sent.emails).toEqual([]);
    expect(await db.authToken.count()).toBe(0);
  });

  it("stops after three links in an hour", async () => {
    const u = await person("admin");
    for (let i = 0; i < 5; i++) await sendResetLink(u.email);
    expect(sent.emails).toHaveLength(3);
  });
});

describe("emailResetLinkTo (an admin sends a link to someone else)", () => {
  it("opens the recipient's own app, because each app refuses other roles' links", async () => {
    const student = await person("student", { locale: "en" });
    const teacher = await person("teacher", { locale: "en" });
    const admin = await person("admin", { locale: "en" });
    for (const u of [student, teacher, admin]) expect(await emailResetLinkTo(u)).toBe("sent");
    const links = sent.emails.map((m) => /https?:\/\/[^\s"]+reset-password\?token=/.exec(m.text)![0]);
    expect(links).toEqual(["https://diary.example/en/reset-password?token=", "https://teachers.example/en/reset-password?token=", `${APP_URL}/en/reset-password?token=`]);
  });

  it("says what a staff-sent link is (not a reply to a request), in the recipient's language", async () => {
    const u = await person("student", { locale: "ru" });
    await emailResetLinkTo(u);
    const [mail] = sent.emails;
    expect(mail.to).toBe(u.email);
    expect(mail.subject).toMatch(/[А-Яа-я]/);
    expect(mail.html + mail.text).toContain("Aysel");
    expect(mail.html + mail.text).not.toContain("Mammadova");
  });

  it("reports what happened: sent, not sent when the email could not be delivered, or too many", async () => {
    const u = await person("student");
    sent.ok = false;
    expect(await emailResetLinkTo(u)).toBe("notSent");
    sent.ok = true;
    expect(await emailResetLinkTo(u)).toBe("sent");
    expect(await emailResetLinkTo(u)).toBe("sent");
    expect(await emailResetLinkTo(u)).toBe("tooMany"); // three tokens issued in the hour, delivered or not
    expect(sent.emails).toHaveLength(3);
  });

  it("shares the hourly limit with the person's own requests", async () => {
    const a = await person("admin");
    await sendResetLink(a.email);
    await sendResetLink(a.email);
    expect(await emailResetLinkTo(a)).toBe("sent");
    expect(await emailResetLinkTo(a)).toBe("tooMany");
  });
});

describe("appUrlFor", () => {
  it("strips a trailing slash, and falls back to the local app when none is configured", () => {
    expect(appUrlFor("student")).toBe("https://diary.example");
    expect(appUrlFor("teacher")).toBe("https://teachers.example");
    expect(appUrlFor("admin")).toBe(APP_URL);
    vi.stubEnv("STUDENT_APP_URL", "");
    vi.stubEnv("TEACHER_APP_URL", "");
    expect(appUrlFor("student")).toBe("http://localhost:3000");
    expect(appUrlFor("teacher")).toBe("http://localhost:3001");
  });

  it("refuses to guess an address on Vercel, where a link to localhost would be useless", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("STUDENT_APP_URL", "");
    expect(() => appUrlFor("student")).toThrow(/STUDENT_APP_URL/);
    expect(appUrlFor("admin")).toBe(APP_URL);
  });
});
