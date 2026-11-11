// The guards behind every Student page, action and route: who counts as a signed-in student. Real database; only the
// cookie (getSession) and redirect() are faked.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as null | { userId: string; role: string; v: number } }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("../session", () => ({ getSession: async () => state.session }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock("@/i18n", () => ({ getRequestLocale: async () => "en" }));

import { db } from "../db";
import { PRIVACY_VERSION } from "../privacy";
import { getCurrentAdmin, getAdminForConsent, getAdminForPasswordChange, getAdminOrNull } from "../auth";
import { resetDatabase } from "../../../test/db";

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
async function user(extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: { name: "S", email: `s${++n}@t.local`, passwordHash: "x", role: "admin", privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: new Date(), ...extra },
  });
}
const signIn = (u: { id: string; role?: string; sessionVersion: number }, over: Partial<{ role: string; v: number }> = {}) => {
  state.session = { userId: u.id, role: over.role ?? "admin", v: over.v ?? u.sessionVersion };
};

beforeEach(async () => {
  await resetDatabase();
  state.session = null;
});
afterAll(() => db.$disconnect());

describe("who is a signed-in admin", () => {
  it("is an admin whose cookie matches an active admin account that has accepted the notice", async () => {
    const u = await user({ locale: "ru", timezone: "Europe/London" });
    signIn(u);
    expect(await getAdminOrNull()).toMatchObject({ id: u.id, email: u.email, locale: "ru", timezone: "Europe/London", mustChangePassword: false, privacyAccepted: true });
    expect((await getCurrentAdmin()).id).toBe(u.id);
  });

  it("is nobody without a cookie, and the page guard sends them to sign in", async () => {
    expect(await getAdminOrNull()).toBeNull();
    expect(await redirectsTo(getCurrentAdmin())).toBe("/en/login?expired=1");
    expect(await redirectsTo(getAdminForConsent())).toBe("/en/login?expired=1");
    expect(await redirectsTo(getAdminForPasswordChange())).toBe("/en/login?expired=1");
  });

  it("refuses a cookie that says student or teacher, even if the account is an admin's", async () => {
    const u = await user();
    for (const role of ["student", "teacher"]) {
      signIn(u, { role });
      expect(await getAdminOrNull()).toBeNull();
    }
  });

  it("refuses an admin cookie on an account that is not an admin's (a teacher or a student with an admin-looking cookie)", async () => {
    for (const role of ["teacher", "student"]) {
      const account = await user({ role });
      signIn(account, { role: "admin" });
      expect(await getAdminOrNull(), role).toBeNull();
    }
  });

  it("refuses a deactivated account, and an account that no longer exists", async () => {
    const gone = await user({ active: false });
    signIn(gone);
    expect(await getAdminOrNull()).toBeNull();
    state.session = { userId: "deleted-account", role: "student", v: 0 };
    expect(await getAdminOrNull()).toBeNull();
  });

  it("refuses a cookie issued before the account's session version moved on (password change, sign out everywhere)", async () => {
    const u = await user({ sessionVersion: 4 });
    signIn(u, { v: 3 });
    expect(await getAdminOrNull()).toBeNull();
    expect(await redirectsTo(getCurrentAdmin())).toBe("/en/login?expired=1");
    signIn(u, { v: 5 });
    expect(await getAdminOrNull()).toBeNull();
    signIn(u, { v: 4 });
    expect(await getAdminOrNull()).not.toBeNull();
  });

  it("holds an admin with a temporary password at the change-password page until they choose their own", async () => {
    const u = await user({ mustChangePassword: true });
    signIn(u);
    expect(await getAdminOrNull()).toBeNull(); // routes answer 401
    expect(await redirectsTo(getCurrentAdmin())).toBe("/en/change-password");
    expect(await redirectsTo(getAdminForConsent())).toBe("/en/change-password");
    expect((await getAdminForPasswordChange()).id).toBe(u.id); // the one place they may be
  });

  it("holds an admin who has not accepted the current notice at the consent page", async () => {
    for (const privacyVersion of [null, PRIVACY_VERSION - 1]) {
      await resetDatabase();
      const u = await user({ privacyVersion });
      signIn(u);
      expect(await getAdminOrNull()).toBeNull();
      expect(await redirectsTo(getCurrentAdmin())).toBe("/en/privacy/accept");
      expect((await getAdminForConsent()).privacyAccepted).toBe(false); // the one place they may be
    }
  });

  it("ignores a saved language that does not exist", async () => {
    const u = await user({ locale: "xx" });
    signIn(u);
    expect((await getCurrentAdmin()).locale).toBeNull();
  });
});
