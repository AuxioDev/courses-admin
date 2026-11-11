import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ values: new Map<string, string>(), sets: [] as { name: string; value: string; options: Record<string, unknown> }[], deleted: [] as string[], connections: 0 }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { value: jar.values.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => void jar.sets.push({ name, value, options }),
    delete: (name: string) => void jar.deleted.push(name),
  }),
}));
vi.mock("next/server", () => ({ connection: async () => void jar.connections++ }));

import { createSession, deleteSession, getSession } from "../session";
import { SESSION_COOKIE } from "../session-cookie";

beforeEach(() => {
  jar.values.clear();
  jar.sets.length = 0;
  jar.deleted.length = 0;
  jar.connections = 0;
});

describe("the session cookie", () => {
  it("is set httpOnly, same-site and for the whole site, and reads back as the same session", async () => {
    await createSession({ userId: "u1", role: "student", v: 2 });
    const [cookie] = jar.sets;
    expect(cookie.name).toBe(SESSION_COOKIE);
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(cookie.options.maxAge).toBeGreaterThan(0);

    jar.values.set(SESSION_COOKIE, cookie.value);
    expect(await getSession()).toMatchObject({ userId: "u1", role: "student", v: 2 });
  });

  it("reads as no session when the cookie is missing, damaged or forged", async () => {
    expect(await getSession()).toBeNull();
    jar.values.set(SESSION_COOKIE, "garbage");
    expect(await getSession()).toBeNull();
  });

  it("keeps the expiry check out of prefetches by waiting for a real request", async () => {
    await getSession();
    expect(jar.connections).toBe(1);
  });

  it("is removed on sign out", async () => {
    await deleteSession();
    expect(jar.deleted).toEqual([SESSION_COOKIE]);
  });
});
