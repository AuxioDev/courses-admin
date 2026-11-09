import { describe, expect, it } from "vitest";
import { tempPassword } from "../temp-password";
import { PASSWORD_MIN_LENGTH } from "../passwords";

describe("tempPassword", () => {
  it("is word-1234-word, readable aloud, and long enough to be a valid password", () => {
    for (let i = 0; i < 200; i++) {
      const p = tempPassword();
      expect(p).toMatch(/^[a-z]{4}-\d{4}-[a-z]{4}$/);
      expect(p.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
    }
  });
  it("is not constant", () => {
    expect(new Set(Array.from({ length: 50 }, tempPassword)).size).toBeGreaterThan(40);
  });
});
