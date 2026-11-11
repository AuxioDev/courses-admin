import { describe, expect, it } from "vitest";
import { isTempPasswordExpired, TEMP_PASSWORD_DAYS, tempPassword, tempPasswordExpiry } from "../temp-password";
import { PASSWORD_MIN_LENGTH } from "../passwords";

describe("tempPassword", () => {
  it("is two groups of five unambiguous characters and a valid password", () => {
    for (let i = 0; i < 500; i++) {
      const p = tempPassword();
      expect(p).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
      expect(p.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
    }
  });

  it("has no look-alike characters", () => {
    const all = Array.from({ length: 300 }, tempPassword).join("");
    expect(all).not.toMatch(/[01oli]/);
  });

  it("is effectively unique", () => {
    expect(new Set(Array.from({ length: 2000 }, tempPassword)).size).toBe(2000);
  });

  it("uses every character of the alphabet (no modulo bias towards a few)", () => {
    const counts = new Map<string, number>();
    for (const c of Array.from({ length: 3000 }, tempPassword).join("").replaceAll("-", "")) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    expect(counts.size).toBe(31);
    // 30000 draws over 31 symbols: about 968 each; a biased generator would drift far from that.
    for (const n of counts.values()) expect(n).toBeGreaterThan(800);
  });
});

describe("temp password expiry", () => {
  const now = new Date("2026-11-11T12:00:00Z");

  it("expires after the configured number of days", () => {
    const expiry = tempPasswordExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(TEMP_PASSWORD_DAYS * 24 * 3600 * 1000);
  });

  it("is expired only when a temporary password is set and the time is up", () => {
    const user = (mustChangePassword: boolean, at: Date | null) => ({ mustChangePassword, tempPasswordExpiresAt: at });
    const past = new Date("2026-11-10T00:00:00Z");
    const future = new Date("2026-11-20T00:00:00Z");
    expect(isTempPasswordExpired(user(true, past), now)).toBe(true);
    expect(isTempPasswordExpired(user(true, now), now)).toBe(true);
    expect(isTempPasswordExpired(user(true, future), now)).toBe(false);
    // An ordinary password, or an account from before this rule, never expires.
    expect(isTempPasswordExpired(user(false, past), now)).toBe(false);
    expect(isTempPasswordExpired(user(true, null), now)).toBe(false);
  });
});
