// Temporary passwords: what an admin hands to a person who must choose their own at first login.
// No Next.js imports, so the account scripts (run with tsx) can use it too.
import { randomInt } from "node:crypto";

// 31 characters with no look-alikes (no 0/o, 1/l/i): easy to read aloud or copy by hand.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUP = 5;
const GROUPS = 2;

// A temporary password stops working this many days after it is issued.
export const TEMP_PASSWORD_DAYS = 7;

// Two groups of 5, like "k7mqe-x3tn9": 31^10, about 49.5 bits, drawn with an unbiased generator.
export function tempPassword() {
  const group = () => Array.from({ length: GROUP }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return Array.from({ length: GROUPS }, group).join("-");
}

export function tempPasswordExpiry(from: Date = new Date()) {
  return new Date(from.getTime() + TEMP_PASSWORD_DAYS * 24 * 60 * 60 * 1000);
}

// True only for an account that still has a temporary password and whose time is up. A null expiry
// (accounts that predate this rule, or a normal password) never expires.
export function isTempPasswordExpired(
  user: { mustChangePassword: boolean; tempPasswordExpiresAt: Date | null },
  now: Date = new Date(),
) {
  return user.mustChangePassword && user.tempPasswordExpiresAt !== null && user.tempPasswordExpiresAt <= now;
}
