import { describe, expect, it } from "vitest";
import { localInputToDate, rulesOverlap, slotInstant, sortRules } from "../schedule-rules";

describe("localInputToDate", () => {
  it("reads a local time in the given timezone", () => {
    expect(localInputToDate("2026-11-16T18:00", "Asia/Baku")?.toISOString()).toBe("2026-11-16T14:00:00.000Z");
    expect(localInputToDate("2026-11-16T18:00", "UTC")?.toISOString()).toBe("2026-11-16T18:00:00.000Z");
  });
  it("returns null for malformed input", () => {
    for (const bad of ["", "2026-11-16", "2026-11-16 18:00", "2026-13-16T18:00", "2026-11-16T24:00", "x"]) {
      expect(localInputToDate(bad, "Asia/Baku")).toBeNull();
    }
  });
  it("is exact on days when the clocks change", () => {
    // New York springs forward on 2026-03-08 (02:00 → 03:00); 12:00 that day is EDT (UTC-4).
    expect(localInputToDate("2026-03-08T12:00", "America/New_York")?.toISOString()).toBe("2026-03-08T16:00:00.000Z");
    // And falls back on 2026-11-01; 12:00 that day is EST (UTC-5).
    expect(localInputToDate("2026-11-01T12:00", "America/New_York")?.toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });
});

describe("slotInstant", () => {
  it("throws on a bad slot instead of returning a wrong date", () => {
    expect(() => slotInstant("2026-11-16", "25:00", "Asia/Baku")).toThrow(/Bad slot/);
  });
});

describe("rules", () => {
  const r = (weekday: number, startTime: string, endTime: string) => ({ weekday, startTime, endTime });

  it("sorts Monday first, Sunday last, then by time", () => {
    const sorted = sortRules([r(0, "10:00", "11:00"), r(3, "18:00", "19:00"), r(1, "20:00", "21:00"), r(1, "09:00", "10:00")]);
    expect(sorted.map((x) => `${x.weekday}@${x.startTime}`)).toEqual(["1@09:00", "1@20:00", "3@18:00", "0@10:00"]);
  });
  it("does not mutate its input", () => {
    const input = [r(2, "10:00", "11:00"), r(1, "10:00", "11:00")];
    sortRules(input);
    expect(input[0].weekday).toBe(2);
  });
  it("detects overlapping rules on the same weekday only", () => {
    expect(rulesOverlap([r(1, "10:00", "11:00"), r(1, "10:30", "11:30")])).toBe(true);
    expect(rulesOverlap([r(1, "10:00", "11:00"), r(1, "11:00", "12:00")])).toBe(false); // back to back is fine
    expect(rulesOverlap([r(1, "10:00", "11:00"), r(2, "10:00", "11:00")])).toBe(false);
    expect(rulesOverlap([])).toBe(false);
  });
});
