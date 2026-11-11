// The Admin Panel's sign-in and password actions against a real database. Only the framework edges are faked: who is
// signed in, the session cookie, redirect(), the browser's headers, and the reset email.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  adminId: "",
  mustChange: false,
  ip: "",
  sessions: [] as { userId: string; role: string; v: number }[],
  signedOut: 0,
  resetEmails: [] as string[],
}));

vi.mock("@/lib/auth", () => {
  const admin = (mustChangePassword = false) => ({ id: state.adminId, name: "A", email: "a@x", timezone: "Asia/Baku", locale: "en", mustChangePassword });
  return { getCurrentAdmin: async () => admin(), getAdminForConsent: async () => admin(), getAdminForPasswordChange: async () => admin(state.mustChange), getAdminOrNull: vi.fn() };
});
vi.mock("@/lib/session", () => ({
  createSession: vi.fn(async (p: { userId: string; role: string; v: number }) => void state.sessions.push(p)),
  deleteSession: vi.fn(async () => void state.signedOut++),
  getSession: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
  headers: async () => new Headers(state.ip ? { "x-real-ip": state.ip } : {}),
}));
vi.mock("@/i18n", () => ({ getRequestLocale: async () => "en" }));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/password-reset", () => ({ sendResetLink: vi.fn(async (email: string) => void state.resetEmails.push(email)) }));

import { db } from "@/lib/db";
import { hashPassword, hashToken, verifyPassword } from "@/lib/passwords";
import * as actions from "../actions";
import { resetDatabase } from "../../../test/db";

const PASSWORD = "correct horse battery";
const HASH = await hashPassword(PASSWORD);
const HOUR = 3_600_000;

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
async function account(role: "student" | "teacher" | "admin" = "admin", extra: Record<string, unknown> = {}) {
  const email = `person${++n}@t.local`;
  const user = await db.user.create({ data: { name: role, email, passwordHash: HASH, role, ...extra } });
  return { user, email };
}

beforeEach(async () => {
  await resetDatabase();
  state.mustChange = false;
  state.ip = "10.0.0.1";
  state.sessions.length = 0;
  state.signedOut = 0;
  state.resetEmails.length = 0;
});
afterAll(() => db.$disconnect());

describe("login", () => {
  const attempt = (email: string, password = PASSWORD, extra: Record<string, string> = {}) => actions.login(undefined, form({ email, password, ...extra }));

  it("signs an admin in, starts a session for that admin and saves the language they used", async () => {
    const { user, email } = await account("admin", { sessionVersion: 3 });
    expect(await redirectsTo(attempt(email))).toBe("/en");
    expect(state.sessions).toEqual([{ userId: user.id, role: "admin", v: 3 }]);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).locale).toBe("en");
  });

  it("uses the language already saved, and holds a temporary password at the change-password page", async () => {
    const saved = await account("admin", { locale: "ru" });
    expect(await redirectsTo(attempt(saved.email))).toBe("/ru");
    const temp = await account("admin", { mustChangePassword: true });
    expect(await redirectsTo(attempt(temp.email))).toBe("/en/change-password");
  });

  it("returns to where the admin was heading, but only inside this site", async () => {
    const { email } = await account("admin");
    expect(await redirectsTo(attempt(email, PASSWORD, { next: "/groups/abc" }))).toBe("/en/groups/abc");
    for (const evil of ["https://evil.example/x", "//evil.example", "\\\\evil.example", "javascript:alert(1)"]) {
      expect(await redirectsTo(attempt(email, PASSWORD, { next: evil }))).toBe("/en");
    }
  });

  it("treats a wrong password, an unknown email and a deactivated account the same way", async () => {
    const { email } = await account("admin");
    const gone = await account("admin", { active: false });
    const answers = [await attempt(email, "wrong"), await attempt("nobody@t.local"), await attempt(gone.email)];
    expect(answers.map((a) => a?.error)).toEqual(["wrongCredentials", "wrongCredentials", "wrongCredentials"]);
    expect(state.sessions).toEqual([]);
  });

  it("refuses a student's or a teacher's account here, without starting a session", async () => {
    for (const role of ["student", "teacher"] as const) {
      const { email } = await account(role);
      expect(await attempt(email)).toEqual({ error: "notAdmin", email });
    }
    expect(state.sessions).toEqual([]);
  });

  it("refuses an expired temporary password with its own message, and counts it as a failure", async () => {
    const { email } = await account("admin", { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() - HOUR) });
    expect(await attempt(email)).toEqual({ error: "tempPasswordExpired", email });
    expect(state.sessions).toEqual([]);
    expect(await db.loginAttempt.count({ where: { email, success: false } })).toBe(1);
  });

  it("answers missing input without touching the database, and ignores the case of the email", async () => {
    expect(await actions.login(undefined, form({ email: "", password: "x" }))).toMatchObject({ error: "missingCredentials" });
    expect(await actions.login(undefined, form({ email: "a@t.local", password: "" }))).toMatchObject({ error: "missingCredentials" });
    expect(await db.loginAttempt.count()).toBe(0);
    const { email } = await account("admin");
    expect(await redirectsTo(attempt(email.toUpperCase()))).toBe("/en");
  });

  it("locks one address out after repeated failures, even for the right password, but not other addresses", async () => {
    const { email } = await account("admin");
    for (let i = 0; i < 5; i++) await attempt(email, "wrong");
    expect(await attempt(email)).toEqual({ error: "tooManyAttempts", email });
    state.ip = "10.0.0.2";
    expect(await redirectsTo(attempt(email))).toBe("/en");
  });
});

describe("logout and password change", () => {
  it("signs out, and signing out everywhere bumps the session version", async () => {
    const { user } = await account("admin");
    state.adminId = user.id;
    expect(await redirectsTo(actions.logout())).toBe("/en/login");
    expect(await redirectsTo(actions.logoutEverywhere())).toBe("/en/login");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(user.sessionVersion + 1);
    expect(state.signedOut).toBe(2);
  });

  const change = (fields: Record<string, string>) => actions.changePassword(undefined, form(fields));
  const good = { currentPassword: PASSWORD, newPassword: "a brand new password", confirmPassword: "a brand new password" };

  it("changes the password, signs out other devices, clears the temporary-password marks and keeps this device in", async () => {
    const { user } = await account("admin", { mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + HOUR) });
    state.adminId = user.id;
    await db.authToken.create({ data: { userId: user.id, type: "reset", tokenHash: "h1", expiresAt: new Date(Date.now() + HOUR) } });
    expect(await change(good)).toEqual({ ok: "passwordChanged" });
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("a brand new password", after.passwordHash)).toBe(true);
    expect(after).toMatchObject({ mustChangePassword: false, tempPasswordExpiresAt: null, sessionVersion: user.sessionVersion + 1 });
    expect(await db.authToken.count()).toBe(0);
    expect(state.sessions).toEqual([{ userId: user.id, role: "admin", v: after.sessionVersion }]);
  });

  it("goes to the start page after the forced change at first login", async () => {
    const { user } = await account("admin", { mustChangePassword: true });
    state.adminId = user.id;
    state.mustChange = true;
    expect(await redirectsTo(change(good))).toBe("/en");
  });

  it("refuses a wrong current password, a short or unmatched new one, and the same one again, and changes nothing", async () => {
    const { user } = await account("admin");
    state.adminId = user.id;
    expect(await change({ ...good, currentPassword: "nope" })).toEqual({ error: "wrongCurrentPassword" });
    expect(await change({ ...good, newPassword: "short", confirmPassword: "short" })).toEqual({ error: "passwordTooShort" });
    expect(await change({ ...good, confirmPassword: "something else entirely" })).toEqual({ error: "passwordMismatch" });
    expect(await change({ currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD })).toEqual({ error: "samePassword" });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(HASH);
    expect(state.sessions).toEqual([]);
  });
});

describe("password reset", () => {
  const request = (email: string) => actions.requestPasswordReset(undefined, form({ email }));
  const RAW = "a-long-random-reset-token";
  const reset = (fields: Record<string, string> = {}) =>
    actions.resetPassword(undefined, form({ token: RAW, newPassword: "a brand new password", confirmPassword: "a brand new password", ...fields }));
  const token = (userId: string, extra: Record<string, unknown> = {}) =>
    db.authToken.create({ data: { userId, type: "reset", tokenHash: hashToken(RAW), expiresAt: new Date(Date.now() + HOUR), ...extra } });

  it("answers the same whether or not the email is registered, and stops one address asking over and over", async () => {
    const { email } = await account("admin");
    expect(await request(email.toUpperCase())).toEqual({ ok: "resetSent" });
    expect(await request("nobody@t.local")).toEqual({ ok: "resetSent" });
    expect(await request("nope")).toEqual({ error: "missingCredentials" });
    for (let i = 0; i < 4; i++) await request("a@t.local");
    expect(await request("a@t.local")).toEqual({ ok: "resetSent" });
    expect(await request("a@t.local")).toEqual({ error: "tooManyAttempts" });
  });

  it("sets the new password, uses the link up, signs out other devices and signs this one in", async () => {
    const { user } = await account("admin", { locale: "ru" });
    await token(user.id);
    expect(await redirectsTo(reset())).toBe("/ru");
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("a brand new password", after.passwordHash)).toBe(true);
    expect(after.sessionVersion).toBe(user.sessionVersion + 1);
    expect(state.sessions).toHaveLength(1);
    expect(await reset()).toEqual({ error: "resetLinkInvalid" });
  });

  it("refuses a link that has expired, is unknown, or belongs to a deactivated account", async () => {
    const { user } = await account("admin");
    await token(user.id, { expiresAt: new Date(Date.now() - 1000) });
    expect(await reset()).toEqual({ error: "resetLinkInvalid" });
    expect(await reset({ token: "something-else" })).toEqual({ error: "resetLinkInvalid" });
    await db.authToken.deleteMany();
    const gone = await account("admin", { active: false });
    await token(gone.user.id);
    expect(await reset()).toEqual({ error: "resetLinkInvalid" });
  });

  it("does not use the link up when the new password is bad, so the person can try again", async () => {
    const { user } = await account("admin");
    await token(user.id);
    expect(await reset({ newPassword: "short", confirmPassword: "short" })).toEqual({ error: "passwordTooShort" });
    expect(await reset({ confirmPassword: "different" })).toEqual({ error: "passwordMismatch" });
    expect((await db.authToken.findFirstOrThrow()).usedAt).toBeNull();
    expect(await redirectsTo(reset())).toBe("/en");
  });

  it("refuses a teacher's link here, and leaves it unused", async () => {
    const { user } = await account("teacher");
    await token(user.id);
    expect(await reset()).toEqual({ error: "notAdmin" });
    expect((await db.authToken.findFirstOrThrow()).usedAt).toBeNull();
  });

  it("lets only one of two simultaneous uses of the same link through", async () => {
    const { user } = await account("admin");
    await token(user.id);
    const results = await Promise.all([redirectsTo(reset()), redirectsTo(reset())].map((p) => p.then((r) => r ?? "error").catch(() => "error")));
    expect(results.filter((r) => String(r).startsWith("/"))).toHaveLength(1);
    expect(state.sessions).toHaveLength(1);
  });
});
