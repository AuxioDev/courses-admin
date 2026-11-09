// The grading rules. The Teacher and Admin apps must use the same functions,
// so a student, their teacher and the admin always see the same numbers.
import type { AttendanceStatus } from "@/generated/prisma/enums";

// Marks are stored on a 0–100 scale. A homework scored out of another maximum is
// converted when the mark is created (18/20 → 90).
export function toHundredScale(score: number, maxScore: number) {
  return maxScore > 0 ? (score / maxScore) * 100 : 0;
}

// Σ(value × weight) / Σ(weight), or null when there's nothing to average.
export function weightedAverage(marks: { value: number; weight: number }[]) {
  const totalWeight = marks.reduce((s, m) => s + m.weight, 0);
  if (totalWeight === 0) return null;
  return marks.reduce((s, m) => s + m.value * m.weight, 0) / totalWeight;
}

export function formatAverage(value: number) {
  return value.toFixed(1);
}

export type Band = "good" | "warn" | "bad";

// Colour bands for 0–100 averages.
export function averageBand(value: number): Band {
  if (value >= 85) return "good";
  if (value >= 60) return "warn";
  return "bad";
}

// Late counts as attended; excused lessons aren't counted at all.
export function attendanceRate(statuses: AttendanceStatus[]) {
  const counted = statuses.filter((s) => s !== "excused");
  if (counted.length === 0) return null;
  return counted.filter((s) => s === "present" || s === "late").length / counted.length;
}

export type AttendanceThresholds = { attendanceWarnBelow: number; attendanceRiskBelow: number };
export type AttendanceLevel = "ok" | "warn" | "risk";

export function attendanceLevel(rate: number | null, t: AttendanceThresholds): AttendanceLevel {
  if (rate === null) return "ok";
  const pct = rate * 100;
  if (pct < t.attendanceRiskBelow) return "risk";
  if (pct < t.attendanceWarnBelow) return "warn";
  return "ok";
}

export function needsAttention<T extends { level: AttendanceLevel }>(c: T): c is T & { level: Exclude<AttendanceLevel, "ok"> } {
  return c.level !== "ok";
}
