import "server-only";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session-cookie";
import { encryptSession, sessionCookieOptions, verifySession, type SessionPayload } from "./session-token";

export type { SessionPayload };

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Verifying expiry reads the clock, so keep this out of prefetches.
  await connection();
  return verifySession(token);
}

export async function createSession(payload: SessionPayload) {
  (await cookies()).set(SESSION_COOKIE, await encryptSession(payload), sessionCookieOptions);
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
