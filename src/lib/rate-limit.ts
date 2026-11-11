import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

const WINDOW_MS = 15 * 60 * 1000;
// Five wrong passwords for one email from one address lock that address out, not the account's owner:
// otherwise a stranger could lock any teacher or admin out of every app by guessing wrong on purpose.
const MAX_FAILURES_PER_EMAIL_AND_IP = 5;
// Guessing spread over many addresses is still bounded.
const MAX_FAILURES_PER_EMAIL = 25;
// Generous: a whole class at school shares one address.
const MAX_FAILURES_PER_IP = 100;
const MAX_RESET_REQUESTS_PER_IP = 30;

// X-Forwarded-For is whatever the client sent plus the proxies' additions, so its first entry can be
// forged to dodge the per-IP limits. Use only headers the platform sets itself: on Vercel,
// x-vercel-forwarded-for (overwritten at the edge); elsewhere x-real-ip, which a reverse proxy must set.
export function pickClientIp(get: (name: string) => string | null, onVercel: boolean) {
  if (onVercel) {
    const vercel = get("x-vercel-forwarded-for")?.split(",")[0].trim();
    if (vercel) return vercel;
  }
  return get("x-real-ip")?.trim() || "unknown";
}

export async function clientIp() {
  const h = await headers();
  return pickClientIp((name) => h.get(name), !!process.env.VERCEL);
}

// Counts failed logins in the last 15 minutes: per email and address, per email, and per address.
export async function isLoginBlocked(email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  // "reset:<email>" rows are forgot-password requests; they don't count against logins.
  const isReset = email.startsWith("reset:");
  const [byEmail, byEmailAndIp, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { email, ip, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({
      where: {
        ip,
        success: false,
        createdAt: { gte: since },
        email: isReset ? { startsWith: "reset:" } : { not: { startsWith: "reset:" } },
      },
    }),
  ]);
  return (
    byEmailAndIp >= MAX_FAILURES_PER_EMAIL_AND_IP ||
    byEmail >= MAX_FAILURES_PER_EMAIL ||
    byIp >= (isReset ? MAX_RESET_REQUESTS_PER_IP : MAX_FAILURES_PER_IP)
  );
}

// A general "at most `limit` of this action per key in the window" counter on the same table, for things that are
// not logins (handing out upload tokens). Returns false, recording nothing, when the key is over its limit.
// Keys are prefixed ("upload:<id>") so they never collide with an email.
export async function takeHit(key: string, ip: string, limit: number, windowMs = WINDOW_MS) {
  const since = new Date(Date.now() - windowMs);
  const used = await db.loginAttempt.count({ where: { email: key, success: false, createdAt: { gte: since } } });
  if (used >= limit) return false;
  await recordLoginAttempt(key, ip, false);
  return true;
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.$transaction([
    db.loginAttempt.create({ data: { email, ip, success } }),
    // A successful login clears the email's failures; old rows are dropped.
    ...(success ? [db.loginAttempt.deleteMany({ where: { email, success: false } })] : []),
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: dayAgo } } }),
  ]);
}
