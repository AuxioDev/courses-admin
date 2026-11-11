// The proxy decides, before any page runs, who is sent where. A pure function of the request.
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { SESSION_COOKIE } from "../session-cookie";
import { encryptSession } from "../session-token";
import { LOCALE_COOKIE } from "@/i18n/config";

const BASE = "http://localhost:3003";
const request = (path: string, init: { cookies?: Record<string, string>; method?: string; acceptLanguage?: string } = {}) =>
  new NextRequest(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.acceptLanguage ? { "accept-language": init.acceptLanguage } : {}),
      ...(init.cookies ? { cookie: Object.entries(init.cookies).map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
    },
  });
const signedIn = async (extra: Record<string, string> = {}) => ({ [SESSION_COOKIE]: await encryptSession({ userId: "u1", role: "admin", v: 0 }), ...extra });
const locationOf = (res: Response) => (res.headers.get("location") ? new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search : null);
const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("language prefix", () => {
  it("adds the language to an address that has none, keeping the query", async () => {
    const res = await proxy(request("/homework?tab=late", { acceptLanguage: "ru-RU,ru;q=0.9,en;q=0.5" }));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe("/ru/homework?tab=late");
  });

  it("prefers the language the person chose over the browser's", async () => {
    const res = await proxy(request("/", { cookies: { [LOCALE_COOKIE]: "az" }, acceptLanguage: "ru" }));
    expect(locationOf(res)).toBe("/az");
  });

  it("falls back to the default language when nothing says otherwise", async () => {
    const res = await proxy(request("/profile", { acceptLanguage: "ja" }));
    expect(locationOf(res)).toMatch(/^\/(az|en|ru)\/profile$/);
  });

  it("remembers the language of the page being viewed", async () => {
    const res = await proxy(request("/en/login"));
    expect(res.cookies.get(LOCALE_COOKIE)?.value).toBe("en");
    const same = await proxy(request("/en/login", { cookies: { [LOCALE_COOKIE]: "en" } }));
    expect(same.cookies.get(LOCALE_COOKIE)).toBeUndefined();
  });
});

describe("signed out", () => {
  it("sends a visitor to sign in, remembering where they were going without the framework's own parameter", async () => {
    expect(locationOf(await proxy(request("/en")))).toBe("/en/login");
    expect(locationOf(await proxy(request("/en/homework/abc?tab=late&_rsc=xyz")))).toBe(`/en/login?next=${encodeURIComponent("/homework/abc?tab=late")}`);
  });

  it("lets the public pages through", async () => {
    for (const path of ["/en/login", "/en/forgot-password", "/en/reset-password", "/en/privacy"]) {
      expect(passesThrough(await proxy(request(path))), path).toBe(true);
    }
  });

  it("does not treat a token for another app, or a forged one, as signed in", async () => {
    const foreign = await new SignJWT({ userId: "u1", role: "admin", v: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("teacher")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
    for (const token of [foreign, "garbage", `${foreign.slice(0, -3)}abc`]) {
      expect(locationOf(await proxy(request("/en/homework", { cookies: { [SESSION_COOKIE]: token } }))), token.slice(0, 12)).toMatch(/^\/en\/login/);
    }
  });
});

describe("signed in", () => {
  it("lets an admin through to the panel", async () => {
    expect(passesThrough(await proxy(request("/en/homework", { cookies: await signedIn() })))).toBe(true);
  });

  it("takes a signed-in admin past the login page, but never interferes with submitting it", async () => {
    expect(locationOf(await proxy(request("/en/login", { cookies: await signedIn() })))).toBe("/en");
    const post = await proxy(request("/en/login", { cookies: await signedIn(), method: "POST" }));
    expect(passesThrough(post)).toBe(true);
  });

  it("clears the cookie and shows the login page when the app says the session is no longer valid", async () => {
    const res = await proxy(request("/en/login?expired=1", { cookies: await signedIn() }));
    expect(locationOf(res)).toBe("/en/login");
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe("");
  });
});

describe("keeping a session alive", () => {
  const issuedAgo = (hours: number) =>
    new SignJWT({ userId: "u1", role: "admin", v: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("admin")
      .setIssuedAt(Math.floor(Date.now() / 1000) - hours * 3600)
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));

  it("renews a session that is long past its renewal time, with the same identity and version", async () => {
    const old = await issuedAgo(30);
    const res = await proxy(request("/en/homework", { cookies: { [SESSION_COOKIE]: old } }));
    const renewed = res.cookies.get(SESSION_COOKIE);
    expect(renewed?.value).toBeTruthy();
    expect(renewed?.value).not.toBe(old);
    const payload = JSON.parse(Buffer.from(renewed!.value.split(".")[1], "base64url").toString());
    expect(payload).toMatchObject({ userId: "u1", role: "admin", v: 0, aud: "admin" });
    expect(payload.iat).toBeGreaterThan(Math.floor(Date.now() / 1000) - 60);
  });

  // An admin's session is short (12 hours) and renewed hourly, unlike the 30-day, daily-renewed ones of the other apps.
  it("leaves a session issued less than an hour ago alone", async () => {
    const res = await proxy(request("/en/homework", { cookies: { [SESSION_COOKIE]: await issuedAgo(0.3) } }));
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("renews an admin's session after an hour of use, so it only ends after twelve hours without it", async () => {
    const res = await proxy(request("/en/homework", { cookies: { [SESSION_COOKIE]: await issuedAgo(2) } }));
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    const payload = JSON.parse(Buffer.from(res.cookies.get(SESSION_COOKIE)!.value.split(".")[1], "base64url").toString());
    expect(payload.exp - payload.iat).toBe(12 * 3600);
  });
});
