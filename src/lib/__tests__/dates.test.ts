import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayKey, dayRange, isDayKey, startOfDay, startOfMonth, startOfWeek, weekday } from "../dates";

const BAKU = "Asia/Baku"; // UTC+4, no DST

describe("dayKey / startOfDay", () => {
  it("reads the calendar day in the given timezone", () => {
    const instant = new Date("2026-11-09T21:00:00Z"); // 01:00 on the 10th in Baku
    expect(dayKey(instant, BAKU)).toBe("2026-11-10");
    expect(dayKey(instant, "UTC")).toBe("2026-11-09");
    expect(dayKey(instant, "America/Los_Angeles")).toBe("2026-11-09");
  });
  it("finds local midnight as a UTC instant", () => {
    expect(startOfDay("2026-11-10", BAKU).toISOString()).toBe("2026-11-09T20:00:00.000Z");
    expect(startOfDay("2026-11-10", "UTC").toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });
  it("round-trips dayKey(startOfDay(k)) === k", () => {
    for (const tz of [BAKU, "UTC", "Europe/Berlin", "America/New_York", "Pacific/Auckland"]) {
      for (const key of ["2026-01-01", "2026-03-08", "2026-03-29", "2026-10-25", "2026-11-01", "2026-12-31"]) {
        expect(dayKey(startOfDay(key, tz), tz)).toBe(key);
      }
    }
  });
  it("handles DST: a spring-forward day is 23h long", () => {
    const { start, end } = dayRange("2026-03-08", "America/New_York");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
  it("handles DST: a fall-back day is 25h long", () => {
    const { start, end } = dayRange("2026-11-01", "America/New_York");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });
});

describe("day arithmetic", () => {
  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-11-09", -9)).toBe("2026-10-31");
  });
  it("knows weekdays (0 = Sunday) and week starts (Monday)", () => {
    expect(weekday("2026-11-09")).toBe(1);
    expect(weekday("2026-11-15")).toBe(0);
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-12")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-16")).toBe("2026-11-16");
  });
  it("moves by months and finds month starts", () => {
    expect(startOfMonth("2026-11-17")).toBe("2026-11-01");
    expect(addMonths("2026-11-17", 1)).toBe("2026-12-01");
    expect(addMonths("2026-11-17", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
  });
});

describe("isDayKey", () => {
  it("accepts well-formed days only", () => {
    expect(isDayKey("2026-11-09")).toBe(true);
    for (const bad of ["2026-1-9", "2026-13-01", "2026-11-31x", "", "today", null, undefined, 20261109]) {
      expect(isDayKey(bad)).toBe(false);
    }
  });
});
