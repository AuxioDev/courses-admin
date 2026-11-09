// Signing and verifying the session cookie. No Next.js imports, so proxy.ts can use it.
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
// Sessions are renewed on use, at most once a day.
export const SESSION_RENEW_AFTER_SECONDS = 60 * 60 * 24;

// `v` must match User.sessionVersion; bumping it signs out every device.
export type SessionPayload = { userId: string; role: Role; v: number };

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.v !== "number") return null;
    return { userId: payload.userId, role: payload.role, v: payload.v, issuedAt: payload.iat ?? 0 };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  // Follows the real protocol: browsers drop Secure cookies on plain http, which
  // would make a local production build log students straight back out.
  secure: !!process.env.VERCEL || (process.env.APP_URL ?? "").startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
