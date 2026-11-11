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
  // Index everything once, so each student costs a few lookups instead of a scan over every row.
  const statuses = new Map<string, AttendanceStatus[]>();
  for (const row of attendance) {
    const key = `${row.lesson.groupId}:${row.studentId}`;
    const list = statuses.get(key);
    if (list) list.push(row.status);
    else statuses.set(key, [row.status]);
  }
  const marksBy = new Map<string, { value: number; weight: number }[]>();
  for (const m of marks) {
    const key = `${m.groupId}:${m.studentId}`;
    const list = marksBy.get(key);
    if (list) list.push(m);
    else marksBy.set(key, [m]);
  }
  // Per group: how many homeworks are past due, and for each student how many they handed in / missed.
  const homeworkBy = new Map<string, { dueAt: Date; handedInBy: Set<string> }[]>();
  for (const hw of homework) {
    const entry = { dueAt: hw.dueAt, handedInBy: new Set(hw.submissions.map((s) => s.studentId)) };
    const list = homeworkBy.get(hw.groupId);
    if (list) list.push(entry);
    else homeworkBy.set(hw.groupId, [entry]);
  }

  const result = new Map<string, StudentProgress[]>(groupIds.map((id) => [id, []]));
  for (const { groupId, status, student } of enrollments) {
    const rate = attendanceRate(statuses.get(`${groupId}:${student.id}`) ?? []);
    const average = weightedAverage(marksBy.get(`${groupId}:${student.id}`) ?? []);
    let handedIn = 0;
    let missed = 0;
    for (const hw of homeworkBy.get(groupId) ?? []) {
      if (hw.handedInBy.has(student.id)) handedIn++;
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
