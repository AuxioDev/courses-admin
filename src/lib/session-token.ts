// Signing and verifying the session cookie. No Next.js imports, so proxy.ts can use it.
// The audience and lifetimes are per app and live in ./session-cookie.
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";
import { SESSION_AUDIENCE, SESSION_MAX_AGE_SECONDS, SESSION_RENEW_AFTER_SECONDS } from "./session-cookie";

export { SESSION_MAX_AGE_SECONDS, SESSION_RENEW_AFTER_SECONDS };

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
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, secretKey(), {
      algorithms: ["HS256"],
      audience: SESSION_AUDIENCE,
    });
    if (typeof payload.userId !== "string" || typeof payload.v !== "number") return null;
    return { userId: payload.userId, role: payload.role, v: payload.v, issuedAt: payload.iat ?? 0 };
  } catch {
    return null;
  }
}

// Secure unless this is plainly a local http:// run: browsers drop Secure cookies on plain http, which
// would make a local production build log everyone straight back out. A production build with no APP_URL
// (or an https one) is Secure.
const localHttp = (process.env.APP_URL ?? "").startsWith("http://");
export const sessionCookieOptions = {
  httpOnly: true,
  secure: !!process.env.VERCEL || (process.env.NODE_ENV === "production" && !localHttp),
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
