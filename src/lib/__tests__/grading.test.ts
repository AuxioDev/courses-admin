import { describe, expect, it } from "vitest";
import {
  attendanceLevel,
  attendanceRate,
  averageBand,
  formatAverage,
  toHundredScale,
  weightedAverage,
} from "../grading";

describe("toHundredScale", () => {
  it("converts to a 0–100 scale", () => {
    expect(toHundredScale(18, 20)).toBe(90);
    expect(toHundredScale(0, 20)).toBe(0);
    expect(toHundredScale(7, 7)).toBe(100);
  });
  it("is 0 when the maximum is 0 or negative", () => {
    expect(toHundredScale(5, 0)).toBe(0);
    expect(toHundredScale(5, -1)).toBe(0);
  });
});

describe("weightedAverage", () => {
  it("is null with nothing to average", () => {
    expect(weightedAverage([])).toBeNull();
    expect(weightedAverage([{ value: 90, weight: 0 }])).toBeNull();
  });
  it("weights marks", () => {
    expect(weightedAverage([{ value: 100, weight: 3 }, { value: 50, weight: 1 }])).toBe(87.5);
    expect(weightedAverage([{ value: 80, weight: 1 }, { value: 60, weight: 1 }])).toBe(70);
  });
  it("ignores zero-weight marks", () => {
    expect(weightedAverage([{ value: 10, weight: 0 }, { value: 80, weight: 2 }])).toBe(80);
  });
});

describe("formatAverage / averageBand", () => {
  it("shows one decimal", () => {
    expect(formatAverage(87.54)).toBe("87.5");
    expect(formatAverage(90)).toBe("90.0");
  });
  it("uses the band boundaries 85 and 60", () => {
    expect(averageBand(100)).toBe("good");
    expect(averageBand(85)).toBe("good");
    expect(averageBand(84.9)).toBe("warn");
    expect(averageBand(60)).toBe("warn");
    expect(averageBand(59.9)).toBe("bad");
    expect(averageBand(0)).toBe("bad");
  });
});

describe("attendance", () => {
  it("counts late as attended and skips excused", () => {
    expect(attendanceRate(["present", "late", "absent", "excused"])).toBeCloseTo(2 / 3);
    expect(attendanceRate(["absent", "absent"])).toBe(0);
  });
  it("is null with nothing counted", () => {
    expect(attendanceRate([])).toBeNull();
    expect(attendanceRate(["excused"])).toBeNull();
  });
  it("maps rates to levels using the thresholds", () => {
    const t = { attendanceWarnBelow: 85, attendanceRiskBelow: 70 };
    expect(attendanceLevel(null, t)).toBe("ok");
    expect(attendanceLevel(0.9, t)).toBe("ok");
    expect(attendanceLevel(0.85, t)).toBe("ok");
    expect(attendanceLevel(0.8, t)).toBe("warn");
    expect(attendanceLevel(0.7, t)).toBe("warn");
    expect(attendanceLevel(0.69, t)).toBe("risk");
  });
});
