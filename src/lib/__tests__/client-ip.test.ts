import { describe, expect, it } from "vitest";
import { pickClientIp } from "../rate-limit";

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

describe("pickClientIp", () => {
  it("ignores a forged X-Forwarded-For on Vercel and uses the platform header", () => {
    const get = headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-vercel-forwarded-for": "9.9.9.9" });
    expect(pickClientIp(get, true)).toBe("9.9.9.9");
  });

  it("never trusts X-Forwarded-For", () => {
    expect(pickClientIp(headers({ "x-forwarded-for": "1.2.3.4" }), true)).toBe("unknown");
    expect(pickClientIp(headers({ "x-forwarded-for": "1.2.3.4" }), false)).toBe("unknown");
  });

  it("uses x-real-ip off Vercel", () => {
    expect(pickClientIp(headers({ "x-real-ip": "10.0.0.7" }), false)).toBe("10.0.0.7");
  });

  it("does not use x-vercel-forwarded-for off Vercel (a client can send it)", () => {
    expect(pickClientIp(headers({ "x-vercel-forwarded-for": "9.9.9.9" }), false)).toBe("unknown");
  });
});
