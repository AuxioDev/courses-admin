import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { isLoginBlocked, recordLoginAttempt, takeHit } from "../rate-limit";
import { resetDatabase } from "../../../test/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("login rate limit (real database)", () => {
  it("blocks an email from one address after 5 failures, not before", async () => {
    for (let i = 0; i < 4; i++) await recordLoginAttempt("a@x.az", "10.0.0.1", false);
    expect(await isLoginBlocked("a@x.az", "10.0.0.1")).toBe(false);
    await recordLoginAttempt("a@x.az", "10.0.0.1", false);
    expect(await isLoginBlocked("a@x.az", "10.0.0.1")).toBe(true);
  });

  it("does not lock the account's owner out when someone else guesses from another address", async () => {
    for (let i = 0; i < 10; i++) await recordLoginAttempt("a@x.az", "6.6.6.6", false);
    expect(await isLoginBlocked("a@x.az", "6.6.6.6")).toBe(true);
    expect(await isLoginBlocked("a@x.az", "10.0.0.1")).toBe(false);
  });

  it("still stops guessing spread over many addresses", async () => {
    for (let i = 0; i < 24; i++) await recordLoginAttempt("a@x.az", `10.0.1.${i}`, false);
    expect(await isLoginBlocked("a@x.az", "10.0.9.9")).toBe(false);
    await recordLoginAttempt("a@x.az", "10.0.1.99", false);
    expect(await isLoginBlocked("a@x.az", "10.0.9.9")).toBe(true);
  });

  it("does not block other emails from the same few failures", async () => {
    for (let i = 0; i < 5; i++) await recordLoginAttempt("a@x.az", "1.1.1.1", false);
    expect(await isLoginBlocked("b@x.az", "9.9.9.9")).toBe(false);
  });

  it("a successful login clears that email's failures", async () => {
    for (let i = 0; i < 5; i++) await recordLoginAttempt("a@x.az", "1.1.1.1", false);
    expect(await isLoginBlocked("a@x.az", "1.1.1.1")).toBe(true);
    await recordLoginAttempt("a@x.az", "1.1.1.1", true);
    expect(await isLoginBlocked("a@x.az", "1.1.1.1")).toBe(false);
  });

  it("ignores failures older than the 15-minute window", async () => {
    await db.loginAttempt.createMany({
      data: Array.from({ length: 6 }, () => ({ email: "a@x.az", ip: "1.1.1.1", success: false, createdAt: new Date(Date.now() - 16 * 60_000) })),
    });
    expect(await isLoginBlocked("a@x.az", "1.1.1.1")).toBe(false);
  });

  it("limits one IP at 100 login failures across many emails", async () => {
    await db.loginAttempt.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({ email: `u${i}@x.az`, ip: "7.7.7.7", success: false })),
    });
    expect(await isLoginBlocked("fresh@x.az", "7.7.7.7")).toBe(true);
    expect(await isLoginBlocked("fresh@x.az", "8.8.8.8")).toBe(false);
  });

  it("counts password-reset requests separately from logins", async () => {
    await db.loginAttempt.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({ email: `reset:u${i}@x.az`, ip: "7.7.7.7", success: false })),
    });
    expect(await isLoginBlocked("reset:new@x.az", "7.7.7.7")).toBe(true);
    expect(await isLoginBlocked("student@x.az", "7.7.7.7")).toBe(false);
  });

  it("prunes attempts older than a day when recording", async () => {
    await db.loginAttempt.create({ data: { email: "old@x.az", ip: "1.1.1.1", success: false, createdAt: new Date(Date.now() - 25 * 3_600_000) } });
    await recordLoginAttempt("new@x.az", "1.1.1.1", false);
    expect(await db.loginAttempt.count({ where: { email: "old@x.az" } })).toBe(0);
  });
});

describe("takeHit (real database)", () => {
  it("allows up to the limit, then refuses without recording more", async () => {
    for (let i = 0; i < 3; i++) expect(await takeHit("upload:s1", "1.1.1.1", 3)).toBe(true);
    expect(await takeHit("upload:s1", "1.1.1.1", 3)).toBe(false);
    expect(await db.loginAttempt.count({ where: { email: "upload:s1" } })).toBe(3);
  });

  it("counts per key, not per address, and does not touch login limits", async () => {
    for (let i = 0; i < 3; i++) await takeHit("upload:s1", `10.0.0.${i}`, 3);
    expect(await takeHit("upload:s1", "9.9.9.9", 3)).toBe(false);
    expect(await takeHit("upload:s2", "1.1.1.1", 3)).toBe(true);
    expect(await isLoginBlocked("s1@x.az", "1.1.1.1")).toBe(false);
  });

  it("forgets hits older than the window", async () => {
    await db.loginAttempt.createMany({
      data: Array.from({ length: 5 }, () => ({ email: "upload:s1", ip: "1.1.1.1", success: false, createdAt: new Date(Date.now() - 16 * 60_000) })),
    });
    expect(await takeHit("upload:s1", "1.1.1.1", 3)).toBe(true);
  });
});
