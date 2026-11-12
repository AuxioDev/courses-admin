import { describe, expect, it, vi } from "vitest";
import { acceptsFile, capsLockOn, copyText, counterState, passwordChecks, PASSWORD_MAX, PASSWORD_MIN } from "../form-kit";
import { newPasswordSchema } from "../passwords";

describe("passwordChecks", () => {
  it("says nothing until the person has typed, then tracks length and match", () => {
    expect(passwordChecks("", "")).toMatchObject({ started: false, longEnough: false, confirmStarted: false, matches: false });
    expect(passwordChecks("abc", "")).toMatchObject({ started: true, longEnough: false });
    expect(passwordChecks("abcdefgh", "abcdefg")).toMatchObject({ longEnough: true, confirmStarted: true, matches: false });
    expect(passwordChecks("abcdefgh", "abcdefgh").matches).toBe(true);
  });

  it("never calls two empty fields a match", () => {
    expect(passwordChecks("", "").matches).toBe(false);
  });

  it("uses the same limits as the server", () => {
    for (const length of [PASSWORD_MIN - 1, PASSWORD_MIN, PASSWORD_MAX, PASSWORD_MAX + 1]) {
      const password = "x".repeat(length);
      const client = passwordChecks(password, password);
      expect(client.longEnough && !client.tooLong).toBe(newPasswordSchema.safeParse(password).success);
    }
  });
});

describe("capsLockOn", () => {
  it("reads the Caps Lock state and survives events that cannot say", () => {
    expect(capsLockOn({ getModifierState: (k) => k === "CapsLock" })).toBe(true);
    expect(capsLockOn({ getModifierState: () => false })).toBe(false);
    expect(capsLockOn({})).toBe(false);
    expect(capsLockOn({ getModifierState: () => { throw new Error("no"); } })).toBe(false);
  });
});

describe("counterState", () => {
  it("stays hidden until the limit is near, then counts down and flags going over", () => {
    expect(counterState(0, 300).show).toBe(false);
    expect(counterState(254, 300).show).toBe(false); // 46 left, more than 15%
    expect(counterState(255, 300)).toEqual({ left: 45, over: false, show: true });
    expect(counterState(300, 300)).toMatchObject({ left: 0, over: false });
    expect(counterState(305, 300)).toMatchObject({ left: -5, over: true, show: true });
  });

  it("shows within ten characters even for tiny limits", () => {
    expect(counterState(45, 50).show).toBe(true);
    expect(counterState(30, 50).show).toBe(false);
  });
});

describe("copyText", () => {
  it("uses the clipboard when it works", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyText("secret", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("secret");
  });

  it("falls back to the old way when the clipboard refuses", async () => {
    const legacy = vi.fn(() => true);
    expect(await copyText("secret", { writeText: async () => { throw new Error("denied"); }, legacy })).toBe(true);
    expect(legacy).toHaveBeenCalledWith("secret");
  });

  it("falls back when there is no clipboard at all, and reports failure instead of throwing", async () => {
    expect(await copyText("x", { legacy: () => true })).toBe(true);
    expect(await copyText("x", { legacy: () => false })).toBe(false);
    expect(await copyText("x", { legacy: () => { throw new Error("no"); } })).toBe(false);
    expect(await copyText("x", {})).toBe(false);
    expect(await copyText("x", { writeText: async () => { throw new Error("denied"); } })).toBe(false);
  });
});

describe("acceptsFile", () => {
  const pdf = { name: "Essay.PDF", type: "application/pdf" };
  const png = { name: "a.png", type: "image/png" };
  it("accepts anything when no list is given", () => {
    expect(acceptsFile(pdf, undefined)).toBe(true);
  });
  it("matches extensions without caring about case, exact types, and type families", () => {
    expect(acceptsFile(pdf, ".pdf,.docx")).toBe(true);
    expect(acceptsFile(png, ".pdf,.docx")).toBe(false);
    expect(acceptsFile(pdf, "application/pdf")).toBe(true);
    expect(acceptsFile(png, "image/*")).toBe(true);
    expect(acceptsFile(pdf, "image/*")).toBe(false);
    expect(acceptsFile(png, " .pdf , image/* ")).toBe(true);
  });
});
