import { describe, expect, it } from "vitest";
import { noteWithoutTrial, TRIAL_NOTE, wantsTrial } from "../trial";

describe("trial lesson marker", () => {
  it("is recognised at the start of a note, with or without more text", () => {
    expect(wantsTrial(TRIAL_NOTE)).toBe(true);
    expect(wantsTrial(`${TRIAL_NOTE} Call after 6 pm`)).toBe(true);
  });
  it("is not recognised elsewhere, or when there is no note", () => {
    expect(wantsTrial("Call after 6 pm")).toBe(false);
    expect(wantsTrial(`Hello ${TRIAL_NOTE}`)).toBe(false);
    expect(wantsTrial(null)).toBe(false);
  });
  it("leaves only what the person wrote", () => {
    expect(noteWithoutTrial(`${TRIAL_NOTE} Call after 6 pm`)).toBe("Call after 6 pm");
    expect(noteWithoutTrial(TRIAL_NOTE)).toBe("");
    expect(noteWithoutTrial("Plain")).toBe("Plain");
  });
});
