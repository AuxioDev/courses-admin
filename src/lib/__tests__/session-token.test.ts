import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptSession, verifySession } from "../session-token";

const payload = { userId: "u1", role: "student" as const, v: 3 };
const key = (s: string) => new TextEncoder().encode(s);

afterEach(() => vi.unstubAllEnvs());

describe("session token", () => {
  it("round-trips the payload", async () => {
    const session = await verifySession(await encryptSession(payload));
    expect(session).toMatchObject(payload);
    expect(session?.issuedAt).toBeGreaterThan(0);
  });

  it("returns null for a missing token", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("rejects garbage and tampered tokens", async () => {
    expect(await verifySession("not-a-jwt")).toBeNull();
    const token = await encryptSession(payload);
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, role: "admin", iat: 1, exp: 9999999999 })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
    expect(await verifySession(`${h}.${p}.${s.slice(0, -2)}xx`)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const other = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(key("a-completely-different-secret-0123456789"));
    expect(await verifySession(other)).toBeNull();
  });

  it("rejects a token issued for another app (audience)", async () => {
    const foreign = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("some-other-app")
      .setExpirationTime("1h")
      .sign(key(process.env.SESSION_SECRET!));
    expect(await verifySession(foreign)).toBeNull();
  });

  it("rejects a token with no audience", async () => {
    const bare = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(key(process.env.SESSION_SECRET!));
    expect(await verifySession(bare)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key(process.env.SESSION_SECRET!));
    expect(await verifySession(expired)).toBeNull();
  });

  it("rejects the alg:none downgrade", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ ...payload, exp: 9999999999 })}.`;
    expect(await verifySession(none)).toBeNull();
  });

  it("rejects payloads without userId or a numeric version", async () => {
    const sign = (claims: object) =>
      new SignJWT(claims as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(key(process.env.SESSION_SECRET!));
    expect(await verifySession(await sign({ role: "student", v: 1 }))).toBeNull();
    expect(await verifySession(await sign({ userId: "u1", role: "student" }))).toBeNull();
    expect(await verifySession(await sign({ userId: "u1", role: "student", v: "1" }))).toBeNull();
  });

  it("refuses to sign or verify with a weak or missing secret", async () => {
    vi.stubEnv("SESSION_SECRET", "too-short");
    await expect(encryptSession(payload)).rejects.toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", "");
    await expect(encryptSession(payload)).rejects.toThrow(/SESSION_SECRET/);
  });
});
