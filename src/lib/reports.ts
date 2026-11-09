import "server-only";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { db } from "./db";
import { pickCurrentTerm } from "./data";
import { dayKey } from "./dates";
import { attendanceLevel, attendanceRate, averageBand, formatAverage, weightedAverage } from "./grading";
import { SCHOOL_TIMEZONE } from "./school";
import { getSchoolSettings } from "./settings";

export const REPORT_TYPES = ["attendance", "marks", "homework", "teachers"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportCell = { text: string; tone?: "good" | "warn" | "bad" };
export type Report = { headers: string[]; rows: ReportCell[][] };

const NONE = "—";
const cell = (value: string | number): ReportCell => ({ text: String(value) });

// Every caller must have checked that this is an admin. These read other people's records.
export async function resolveReportFilters(params: { type?: unknown; term?: unknown; group?: unknown }) {
  const type = REPORT_TYPES.find((t) => t === params.type) ?? "attendance";
  const terms = (await db.term.findMany({ orderBy: { startDate: "desc" } })).map((t) => ({
    id: t.id,
    name: t.name,
    startDate: t.startDate.toISOString().slice(0, 10),
    endDate: t.endDate.toISOString().slice(0, 10),
  }));
  const today = dayKey(new Date(), SCHOOL_TIMEZONE);
  const term = terms.find((t) => t.id === params.term) ?? pickCurrentTerm(terms, today) ?? terms[0] ?? null;
  const groups = term
    ? await db.group.findMany({
        where: { termId: term.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true, teacherId: true, course: { select: { title: true } } },
      })
    : [];
  // A group left over from another term is ignored rather than showing an empty report.
  const groupId = groups.find((g) => g.id === params.group)?.id ?? null;
  return { type, terms, term, groups, groupId };
}

type Filters = Awaited<ReturnType<typeof resolveReportFilters>>;
type Group = Filters["groups"][number];
type T = Dictionary;

async function enrolledStudents(groups: Group[], t: T) {
  const enrollments = await db.enrollment.findMany({
    where: { groupId: { in: groups.map((g) => g.id) } },
    select: { groupId: true, status: true, student: { select: { id: true, name: true, active: true } } },
  });
  return enrollments
    .map((e) => {
      const group = groups.find((g) => g.id === e.groupId)!;
      const stillIn = e.status === "active" && e.student.active;
      return {
        studentId: e.student.id,
        groupId: e.groupId,
        lead: [
          cell(stillIn ? e.student.name : `${e.student.name} (${t.reports.left})`),
          cell(group.course.title),
          cell(group.name),
        ],
        sortKey: `${group.name}\u0000${e.student.name}`,
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

const studentHeaders = (t: T) => [t.reports.student, t.reports.course, t.reports.group];

async function attendanceReport(groups: Group[], t: T): Promise<Report> {
  const [students, rows, settings] = await Promise.all([
    enrolledStudents(groups, t),
    db.attendance.findMany({
      where: { lesson: { groupId: { in: groups.map((g) => g.id) } } },
      select: { studentId: true, status: true, lesson: { select: { groupId: true } } },
    }),
    getSchoolSettings(),
  ]);
  return {
    headers: [
      ...studentHeaders(t),
      t.reports.present,
      t.reports.late,
      t.reports.absent,
      t.reports.excused,
      t.reports.attendanceRate,
    ],
    rows: students.map((s) => {
      const statuses: AttendanceStatus[] = rows
        .filter((r) => r.studentId === s.studentId && r.lesson.groupId === s.groupId)
        .map((r) => r.status);
      const count = (status: AttendanceStatus) => cell(statuses.filter((x) => x === status).length);
      const rate = attendanceRate(statuses);
      const level = attendanceLevel(rate, settings);
      return [
        ...s.lead,
        count("present"),
        count("late"),
        count("absent"),
        count("excused"),
        {
          text: rate === null ? NONE : `${Math.round(rate * 100)}%`,
          tone: level === "risk" ? ("bad" as const) : level === "warn" ? ("warn" as const) : undefined,
        },
      ];
    }),
  };
}

async function marksReport(groups: Group[], t: T): Promise<Report> {
  const ids = groups.map((g) => g.id);
  const [students, marks, finals] = await Promise.all([
    enrolledStudents(groups, t),
    db.mark.findMany({
      where: { groupId: { in: ids } },
      select: { studentId: true, groupId: true, value: true, weight: true },
    }),
    db.finalGrade.findMany({
      where: { groupId: { in: ids } },
      select: { studentId: true, groupId: true, value: true, published: true },
    }),
  ]);
  return {
    headers: [...studentHeaders(t), t.reports.marks, t.reports.average, t.reports.finalGrade, t.reports.finalState],
    rows: students.map((s) => {
      const own = marks.filter((m) => m.studentId === s.studentId && m.groupId === s.groupId);
      const average = weightedAverage(own);
      const final = finals.find((f) => f.studentId === s.studentId && f.groupId === s.groupId);
      const band = average === null ? null : averageBand(average);
      return [
        ...s.lead,
        cell(own.length),
        { text: average === null ? NONE : formatAverage(average), tone: band ?? undefined },
        cell(final ? final.value : NONE),
        cell(final ? (final.published ? t.grades.published : t.grades.draft) : NONE),
      ];
    }),
  };
}

// Counts and dates only: what students wrote or uploaded is never read here.
function loadHomework(groupIds: string[]) {
  return db.homework.findMany({
    where: { groupId: { in: groupIds } },
    select: {
      groupId: true,
      dueAt: true,
      submissions: {
        select: {
          studentId: true,
          status: true,
          attempts: { select: { number: true, late: true, submittedAt: true, reviewedAt: true } },
        },
      },
    },
  });
}

async function homeworkReport(groups: Group[], t: T): Promise<Report> {
  const [students, homework] = await Promise.all([enrolledStudents(groups, t), loadHomework(groups.map((g) => g.id))]);
  const now = new Date();
  return {
    headers: [
      ...studentHeaders(t),
      t.reports.handedIn,
      t.reports.handedInLate,
      t.reports.graded,
      t.reports.returned,
      t.reports.missed,
    ],
    rows: students.map((s) => {
      let handedIn = 0;
      let late = 0;
      let graded = 0;
      let returned = 0;
      let missed = 0;
      for (const hw of homework) {
        if (hw.groupId !== s.groupId) continue;
        const submission = hw.submissions.find((x) => x.studentId === s.studentId);
        if (!submission) {
          if (hw.dueAt < now) missed++;
          continue;
        }
        handedIn++;
        const latest = submission.attempts.reduce((a, b) => (b.number > a.number ? b : a), submission.attempts[0]);
        if (latest?.late) late++;
        if (submission.status === "graded") graded++;
        if (submission.status === "returned") returned++;
      }
      return [
        ...s.lead,
        cell(handedIn),
        cell(late),
        cell(graded),
        cell(returned),
        { text: String(missed), tone: missed >= 2 ? ("warn" as const) : undefined },
      ];
    }),
  };
}

async function teachersReport(groups: Group[], t: T): Promise<Report> {
  const ids = groups.map((g) => g.id);
  const now = new Date();
  const [lessons, marks, homework] = await Promise.all([
    db.lesson.findMany({
      where: { groupId: { in: ids } },
      select: { teacherId: true, status: true, endsAt: true, _count: { select: { attendance: true } } },
    }),
    db.mark.findMany({ where: { groupId: { in: ids } }, select: { createdBy: true } }),
    loadHomework(ids),
  ]);
  const teacherIds = [...new Set([...groups.map((g) => g.teacherId), ...lessons.map((l) => l.teacherId)])];
  const teachers = await db.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } });
  const teacherOf = new Map(groups.map((g) => [g.id, g.teacherId]));

  return {
    headers: [
      t.reports.teacher,
      t.reports.groups,
      t.reports.lessonsHeld,
      t.reports.lessonsNotMarked,
      t.reports.homeworkGiven,
      t.reports.marksGiven,
      t.reports.reviewed,
      t.reports.waiting,
      t.reports.reviewHours,
    ],
    rows: teachers
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((teacher) => {
        const own = lessons.filter((l) => l.teacherId === teacher.id);
        const notMarked = own.filter(
          (l) => (l.status === "scheduled" || l.status === "moved") && l.endsAt < now && l._count.attendance === 0,
        ).length;
        const held = own.filter((l) => l.status === "done" || l._count.attendance > 0).length;
        const theirs = homework.filter((h) => teacherOf.get(h.groupId) === teacher.id);
        const attempts = theirs.flatMap((h) => h.submissions.flatMap((s) => s.attempts));
        const reviewed = attempts.filter((a) => a.reviewedAt);
        const waiting = theirs.flatMap((h) => h.submissions).filter((s) => s.status === "submitted" || s.status === "late");
        const hours = reviewed.map((a) => (a.reviewedAt!.getTime() - a.submittedAt.getTime()) / 36e5);
        return [
          cell(teacher.name),
          cell(groups.filter((g) => g.teacherId === teacher.id).length),
          cell(held),
          { text: String(notMarked), tone: notMarked > 0 ? ("warn" as const) : undefined },
          cell(theirs.length),
          cell(marks.filter((m) => m.createdBy === teacher.id).length),
          cell(reviewed.length),
          cell(waiting.length),
          cell(hours.length ? (hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1) : NONE),
        ];
      }),
  };
}

export async function buildReport(filters: Filters, t: T): Promise<Report> {
  const groups = filters.groupId ? filters.groups.filter((g) => g.id === filters.groupId) : filters.groups;
  switch (filters.type) {
    case "attendance":
      return attendanceReport(groups, t);
    case "marks":
      return marksReport(groups, t);
    case "homework":
      return homeworkReport(groups, t);
    case "teachers":
      return teachersReport(groups, t);
  }
}
