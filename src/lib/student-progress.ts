import "server-only";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { db } from "./db";
import { attendanceLevel, attendanceRate, averageBand, weightedAverage, type AttendanceLevel } from "./grading";
import { getSchoolSettings } from "./settings";

// The same definition as the Teacher App, so the Dashboard and a teacher's own screens
// agree: attendance under the school limits, an average in the red band, or 2+ missed homeworks.
const MISSED_HOMEWORK_LIMIT = 2;

export type StudentProgress = {
  id: string;
  name: string;
  enrolled: boolean;
  attendanceRate: number | null;
  attendanceLevel: AttendanceLevel;
  average: number | null;
  handedIn: number;
  missed: number;
  lowAverage: boolean;
  tooManyMissed: boolean;
  fallingBehind: boolean;
};

export async function progressByGroup(groupIds: string[]) {
  const [enrollments, attendance, marks, homework, settings] = await Promise.all([
    db.enrollment.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, status: true, student: { select: { id: true, name: true, active: true } } },
      orderBy: { student: { name: "asc" } },
    }),
    db.attendance.findMany({
      where: { lesson: { groupId: { in: groupIds } } },
      select: { studentId: true, status: true, lesson: { select: { groupId: true } } },
    }),
    db.mark.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, studentId: true, value: true, weight: true },
    }),
    db.homework.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, dueAt: true, submissions: { select: { studentId: true } } },
    }),
    getSchoolSettings(),
  ]);

  const now = new Date();
  const statuses = new Map<string, AttendanceStatus[]>();
  for (const row of attendance) {
    const key = `${row.lesson.groupId}:${row.studentId}`;
    statuses.set(key, [...(statuses.get(key) ?? []), row.status]);
  }

  const result = new Map<string, StudentProgress[]>(groupIds.map((id) => [id, []]));
  for (const { groupId, status, student } of enrollments) {
    const rate = attendanceRate(statuses.get(`${groupId}:${student.id}`) ?? []);
    const average = weightedAverage(marks.filter((m) => m.groupId === groupId && m.studentId === student.id));
    let handedIn = 0;
    let missed = 0;
    for (const hw of homework) {
      if (hw.groupId !== groupId) continue;
      if (hw.submissions.some((s) => s.studentId === student.id)) handedIn++;
      else if (hw.dueAt < now) missed++;
    }
    const enrolled = status === "active" && student.active;
    const level = attendanceLevel(rate, settings);
    const lowAverage = average !== null && averageBand(average) === "bad";
    const tooManyMissed = missed >= MISSED_HOMEWORK_LIMIT;
    result.get(groupId)!.push({
      id: student.id,
      name: student.name,
      enrolled,
      attendanceRate: rate,
      attendanceLevel: level,
      average,
      handedIn,
      missed,
      lowAverage,
      tooManyMissed,
      fallingBehind: enrolled && (level !== "ok" || lowAverage || tooManyMissed),
    });
  }
  return result;
}
