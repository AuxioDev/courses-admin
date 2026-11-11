import { describe, expect, it } from "vitest";
import { hourRange, minutesOf, placeDay, type GridLesson } from "../schedule-grid";

let n = 0;
const lesson = (start: string, end: string, extra: Partial<GridLesson> = {}): GridLesson => ({
  id: `l${++n}`,
  start,
  end,
  status: "scheduled",
  teacherId: `t${n}`,
  ...extra,
});

describe("minutesOf", () => {
  it("reads HH:MM", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("23:59")).toBe(1439);
  });
});

describe("placeDay", () => {
  it("gives lessons that do not overlap a whole column each", () => {
    const placed = placeDay([lesson("09:00", "10:00"), lesson("11:00", "12:00"), lesson("15:00", "16:30")]);
    expect(placed.map((p) => [p.lane, p.lanes])).toEqual([[0, 1], [0, 1], [0, 1]]);
  });

  it("treats back-to-back lessons as separate, not overlapping", () => {
    const placed = placeDay([lesson("09:00", "10:00"), lesson("10:00", "11:00")]);
    expect(placed.map((p) => [p.lane, p.lanes])).toEqual([[0, 1], [0, 1]]);
  });

  it("puts overlapping lessons side by side and shares the width", () => {
    const placed = placeDay([lesson("09:00", "10:30"), lesson("10:00", "11:00")]);
    expect(placed.map((p) => [p.lane, p.lanes])).toEqual([[0, 2], [1, 2]]);
  });

  it("reuses a freed column inside a cluster, and starts a new cluster afterwards", () => {
    // Same start sorts by end, so B (09-10) takes column 0 and A (09-12) column 1. C (10-11) starts as B ends and
    // reuses B's column; D (13-14) is a new cluster and has the whole width.
    const placed = placeDay([lesson("09:00", "12:00"), lesson("09:00", "10:00"), lesson("10:00", "11:00"), lesson("13:00", "14:00")]);
    expect(placed.map((p) => [p.start, p.end, p.lane, p.lanes])).toEqual([
      ["09:00", "10:00", 0, 2],
      ["09:00", "12:00", 1, 2],
      ["10:00", "11:00", 0, 2],
      ["13:00", "14:00", 0, 1],
    ]);
  });

  it("sorts lessons that arrive in any order", () => {
    const placed = placeDay([lesson("15:00", "16:00"), lesson("09:00", "10:00")]);
    expect(placed.map((p) => p.start)).toEqual(["09:00", "15:00"]);
  });

  it("draws a lesson that runs past midnight to the end of its day", () => {
    const [placed] = placeDay([lesson("23:00", "00:30")]);
    expect(placed.endMin).toBe(24 * 60);
  });

  it("flags a teacher booked into two overlapping lessons, and both lessons", () => {
    const placed = placeDay([lesson("09:00", "10:30", { teacherId: "same" }), lesson("10:00", "11:00", { teacherId: "same" }), lesson("10:00", "11:00", { teacherId: "other" })]);
    expect(placed.map((p) => p.clash)).toEqual([true, true, false]);
  });

  it("does not flag the same teacher back to back, or on different times", () => {
    const placed = placeDay([lesson("09:00", "10:00", { teacherId: "x" }), lesson("10:00", "11:00", { teacherId: "x" }), lesson("14:00", "15:00", { teacherId: "x" })]);
    expect(placed.every((p) => !p.clash)).toBe(true);
  });

  it("ignores a cancelled lesson when looking for a double booking", () => {
    const placed = placeDay([lesson("09:00", "10:00", { teacherId: "x", status: "cancelled" }), lesson("09:30", "10:30", { teacherId: "x" })]);
    expect(placed.map((p) => p.clash)).toEqual([false, false]);
  });

  it("keeps a cancelled lesson on the grid", () => {
    expect(placeDay([lesson("09:00", "10:00", { status: "cancelled" })])).toHaveLength(1);
  });

  it("handles an empty day", () => {
    expect(placeDay([])).toEqual([]);
  });
});

describe("hourRange", () => {
  const at = (start: string, end: string) => placeDay([lesson(start, end)]);

  it("shows 08:00 to 20:00 by default, even with no lessons", () => {
    expect(hourRange([])).toEqual({ from: 8, to: 20 });
    expect(hourRange([at("10:00", "11:00")])).toEqual({ from: 8, to: 20 });
  });

  it("widens to fit an early or a late lesson", () => {
    expect(hourRange([at("06:30", "07:30")])).toEqual({ from: 6, to: 20 });
    expect(hourRange([at("19:00", "21:15")])).toEqual({ from: 8, to: 22 });
    expect(hourRange([at("07:00", "08:00"), at("20:00", "21:00")])).toEqual({ from: 7, to: 21 });
  });

  it("never goes outside the day", () => {
    expect(hourRange([at("00:00", "01:00"), at("23:00", "00:30")])).toEqual({ from: 0, to: 24 });
  });
});
