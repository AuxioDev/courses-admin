import { formatTime, isDayKey, startOfDay, type DayKey } from "./dates";

const LOCAL_INPUT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// A local "2026-11-16T18:00" read in the given timezone. Null if malformed.
// The same logic as the Teacher App's homework-rules.ts.
export function localInputToDate(value: string, timeZone: string): Date | null {
  const match = LOCAL_INPUT.exec(value);
  if (!match || !isDayKey(match[1])) return null;
  const wanted = Number(match[2]) * 60 + Number(match[3]);
  if (wanted >= 24 * 60) return null;
  const guess = new Date(startOfDay(match[1], timeZone).getTime() + wanted * 60_000);
  // Midnight plus minutes is an hour out on a day when the clocks change.
  const drift = wanted - minutesOf(formatTime(guess, timeZone));
  return new Date(guess.getTime() + drift * 60_000);
}

export function slotInstant(day: DayKey, time: string, timeZone: string) {
  const date = localInputToDate(`${day}T${time}`, timeZone);
  if (!date) throw new Error(`Bad slot ${day} ${time}`);
  return date;
}

export type DraftRule = { weekday: number; startTime: string; endTime: string };

// Monday first, then by time, the way a week reads on a timetable.
export function sortRules<T extends DraftRule>(rules: T[]) {
  return [...rules].sort(
    (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.startTime.localeCompare(b.startTime),
  );
}

export function rulesOverlap(rules: DraftRule[]) {
  return rules.some((a, i) =>
    rules.some((b, j) => i < j && a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime),
  );
}
