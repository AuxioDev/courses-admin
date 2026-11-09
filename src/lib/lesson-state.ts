import type { LessonStatus } from "@/generated/prisma/enums";

type Lesson = { status: LessonStatus; startsAt: Date; attendance: number; termLocked: boolean };

export type LessonBlock = "termLocked" | "lessonDone" | "lessonHasAttendance" | "lessonCancelled" | "lessonPast";

// Why this lesson can't be touched. Attendance is a record of something that happened.
function heldBlock(l: Lesson): LessonBlock | null {
  if (l.termLocked) return "termLocked";
  if (l.status === "done") return "lessonDone";
  if (l.attendance > 0) return "lessonHasAttendance";
  return null;
}

// A lesson that never took place may still be moved or cancelled, even after its date.
export function moveBlock(l: Lesson): LessonBlock | null {
  return heldBlock(l) ?? (l.status === "cancelled" ? "lessonCancelled" : null);
}

export const cancelBlock = moveBlock;

export function restoreBlock(l: Lesson, now: Date): LessonBlock | null {
  if (l.termLocked) return "termLocked";
  return l.startsAt <= now ? "lessonPast" : null;
}

// Who taught a past lesson is history.
export function teacherBlock(l: Lesson, now: Date): LessonBlock | null {
  return moveBlock(l) ?? (l.startsAt <= now ? "lessonPast" : null);
}

export function linkBlock(l: Lesson): LessonBlock | null {
  if (l.termLocked) return "termLocked";
  if (l.status === "done") return "lessonDone";
  return l.status === "cancelled" ? "lessonCancelled" : null;
}
