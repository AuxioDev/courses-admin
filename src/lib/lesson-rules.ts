import "server-only";
import { db } from "./db";

type Candidate = { groupId: string; teacherId: string; start: Date; end: Date; excludeId?: string };

// A teacher or group can't be in two places at once. Students who share another group
// only earn a warning, because that can be deliberate.
export async function findLessonOverlaps({ groupId, teacherId, start, end, excludeId }: Candidate) {
  const students = await db.enrollment.findMany({
    where: { groupId, status: "active", student: { active: true } },
    select: { studentId: true },
  });
  const hits = await db.lesson.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      status: { not: "cancelled" },
      startsAt: { lt: end },
      endsAt: { gt: start },
      OR: [
        { groupId },
        { teacherId },
        {
          group: {
            enrollments: { some: { status: "active", studentId: { in: students.map((s) => s.studentId) } } },
          },
        },
      ],
    },
    select: { groupId: true, teacherId: true, group: { select: { name: true } } },
  });
  const clash: "group" | "teacher" | null = hits.some((h) => h.groupId === groupId)
    ? "group"
    : hits.some((h) => h.teacherId === teacherId)
      ? "teacher"
      : null;
  return { clash, sharedWith: hits[0]?.group.name ?? null };
}
