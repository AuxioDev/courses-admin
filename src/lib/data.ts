import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { LessonStatus, Role } from "@/generated/prisma/enums";
import { db } from "./db";
import { getCurrentAdmin } from "./auth";
import { addDays, dayKey, formatTime, isDayKey, startOfDay, startOfWeek } from "./dates";
import { findLessonOverlaps } from "./lesson-rules";
import { cancelBlock, linkBlock, moveBlock, restoreBlock, teacherBlock } from "./lesson-state";
import { SCHOOL_TIMEZONE } from "./school";
import { sortRules } from "./schedule-rules";
import { weightedAverage } from "./grading";
import { getMarkWeights, getSchoolSettings } from "./settings";
import { progressByGroup } from "./student-progress";

// Term dates are calendar days stored at midnight UTC, so no timezone applies here.
const termDay = (date: Date) => date.toISOString().slice(0, 10);

// ---------- Dashboard ----------

const DASHBOARD_LIST_SIZE = 8;

const lessonRowSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  teacher: { select: { name: true, active: true } },
  group: { select: { name: true, course: { select: { title: true } } } },
} satisfies Prisma.LessonSelect;

function lessonRow(l: Prisma.LessonGetPayload<{ select: typeof lessonRowSelect }>) {
  return {
    id: l.id,
    day: dayKey(l.startsAt, SCHOOL_TIMEZONE),
    start: formatTime(l.startsAt, SCHOOL_TIMEZONE),
    end: formatTime(l.endsAt, SCHOOL_TIMEZONE),
    status: l.status,
    course: l.group.course.title,
    group: l.group.name,
    teacher: l.teacher.name,
  };
}

// The term containing today, or else the latest started: the Diary's rule, newest first.
export function pickCurrentTerm<T extends { startDate: string; endDate: string }>(terms: T[], today: string) {
  return terms.find((t) => t.startDate <= today && today <= t.endDate) ?? terms.find((t) => t.startDate <= today) ?? null;
}

export async function getDashboard() {
  const admin = await getCurrentAdmin();
  const now = new Date();
  const today = dayKey(now, SCHOOL_TIMEZONE);
  const running: LessonStatus[] = ["scheduled", "moved"];
  const notMarked = {
    status: { in: running },
    endsAt: { lt: now },
    attendance: { none: {} },
    group: { term: { locked: false } },
  } satisfies Prisma.LessonWhereInput;
  const noTeacher = {
    status: { in: running },
    startsAt: { gte: now },
    teacher: { active: false },
  } satisfies Prisma.LessonWhereInput;

  const [courses, teachers, students, groups, upcomingLessons, todayLessons, notMarkedCount, notMarkedRows, noTeacherCount, noTeacherRows, deletionRequests, terms] =
    await Promise.all([
      db.course.count({ where: { archived: false } }),
      db.user.count({ where: { role: "teacher", active: true } }),
      db.user.count({ where: { role: "student", active: true } }),
      db.group.count(),
      db.lesson.count({ where: { startsAt: { gte: now }, status: { not: "cancelled" } } }),
      db.lesson.findMany({
        where: {
          startsAt: { gte: startOfDay(today, SCHOOL_TIMEZONE), lt: startOfDay(addDays(today, 1), SCHOOL_TIMEZONE) },
        },
        orderBy: { startsAt: "asc" },
        select: lessonRowSelect,
      }),
      db.lesson.count({ where: notMarked }),
      db.lesson.findMany({
        where: notMarked,
        orderBy: { startsAt: "desc" },
        take: DASHBOARD_LIST_SIZE,
        select: lessonRowSelect,
      }),
      db.lesson.count({ where: noTeacher }),
      db.lesson.findMany({
        where: noTeacher,
        orderBy: { startsAt: "asc" },
        take: DASHBOARD_LIST_SIZE,
        select: lessonRowSelect,
      }),
      db.user.count({ where: STATUS_FILTERS.deletion }),
      db.term.findMany({ orderBy: { startDate: "desc" } }),
    ]);

  const current = pickCurrentTerm(
    terms.map((t) => ({ id: t.id, name: t.name, startDate: termDay(t.startDate), endDate: termDay(t.endDate) })),
    today,
  );
  const currentGroups = current
    ? await db.group.findMany({
        where: { termId: current.id },
        select: { id: true, name: true, course: { select: { title: true } } },
      })
    : [];
  const progress = await progressByGroup(currentGroups.map((g) => g.id));
  const atRisk = currentGroups
    .flatMap((group) =>
      (progress.get(group.id) ?? [])
        .filter((s) => s.fallingBehind)
        .map((s) => ({ ...s, groupId: group.id, group: group.name, course: group.course.title })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    adminName: admin.name,
    today,
    counts: { courses, teachers, students, groups, upcomingLessons },
    todayLessons: todayLessons.map(lessonRow),
    notMarked: { total: notMarkedCount, rows: notMarkedRows.map(lessonRow) },
    noTeacher: { total: noTeacherCount, rows: noTeacherRows.map(lessonRow) },
    atRisk: { total: atRisk.length, rows: atRisk.slice(0, DASHBOARD_LIST_SIZE) },
    termName: current?.name ?? null,
    deletionRequests,
  };
}

// ---------- Settings ----------

export async function getSettings() {
  await getCurrentAdmin();
  const [limits, weights] = await Promise.all([getSchoolSettings(), getMarkWeights()]);
  return { ...limits, weights };
}

// ---------- Users ----------

const USERS_PER_PAGE = 50;

const STATUS_FILTERS = {
  active: { active: true },
  deactivated: { active: false },
  temp: { active: true, mustChangePassword: true },
  deletion: { deletionRequestedAt: { not: null }, deletionApprovedAt: null },
} satisfies Record<string, Prisma.UserWhereInput>;

export type UserStatusFilter = keyof typeof STATUS_FILTERS;

const isStatusFilter = (value: unknown): value is UserStatusFilter =>
  typeof value === "string" && Object.hasOwn(STATUS_FILTERS, value);
const isRole = (value: unknown): value is Role => value === "admin" || value === "teacher" || value === "student";

export async function getUsers(filters: { role?: unknown; status?: unknown; q?: unknown; page?: unknown }) {
  await getCurrentAdmin();
  const role = isRole(filters.role) ? filters.role : null;
  const status = isStatusFilter(filters.status) ? filters.status : null;
  const q = typeof filters.q === "string" ? filters.q.trim().slice(0, 100) : "";
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(status ? STATUS_FILTERS[status] : {}),
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const [total, deletionRequests] = await Promise.all([
    db.user.count({ where }),
    db.user.count({ where: STATUS_FILTERS.deletion }),
  ]);
  const pages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
  const requested = Number(filters.page);
  const page = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, pages) : 1;
  const users = await db.user.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * USERS_PER_PAGE,
    take: USERS_PER_PAGE,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      deletionRequestedAt: true,
      deletionApprovedAt: true,
    },
  });
  return { users, role, status, q, page, pages, total, deletionRequests };
}

export async function getUser(id: string) {
  const admin = await getCurrentAdmin();
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      bio: true,
      showOnWebsite: true,
      deactivatedAt: true,
      deletionRequestedAt: true,
      deletionApprovedAt: true,
      privateDataErasedAt: true,
    },
  });
  if (!user) return null;
  const upcomingLessons =
    user.role === "teacher"
      ? await db.lesson.count({
          where: { teacherId: id, startsAt: { gte: new Date() }, status: { not: "cancelled" } },
        })
      : 0;
  return { ...user, upcomingLessons, isSelf: user.id === admin.id, adminTimezone: admin.timezone };
}

// ---------- Courses ----------

export async function getCourses(includeArchived: boolean) {
  await getCurrentAdmin();
  const courses = await db.course.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: [{ archived: "asc" }, { title: "asc" }],
    include: { _count: { select: { groups: true } } },
  });
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    archived: c.archived,
    groups: c._count.groups,
  }));
}

export async function getCourse(id: string) {
  await getCurrentAdmin();
  return db.course.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, archived: true, level: true, showOnWebsite: true },
  });
}

// ---------- Groups ----------

export async function getGroups(filters: { term?: unknown }) {
  await getCurrentAdmin();
  const terms = await db.term.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } });
  const termId = terms.find((t) => t.id === filters.term)?.id ?? null;
  const groups = await db.group.findMany({
    where: termId ? { termId } : {},
    orderBy: [{ term: { startDate: "desc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      course: { select: { title: true } },
      term: { select: { name: true, locked: true } },
      teacher: { select: { name: true, active: true } },
      enrollments: { where: { status: "active", student: { active: true } }, select: { id: true } },
      _count: { select: { lessons: true } },
    },
  });
  return { terms, termId, groups };
}

// What the group form can choose from. An archived course, locked term or deactivated
// teacher is only offered when it is what this group already has.
export async function getGroupOptions(current?: { courseId: string; teacherId: string; termId: string }) {
  await getCurrentAdmin();
  const [courses, teachers, terms] = await Promise.all([
    db.course.findMany({
      where: { OR: [{ archived: false }, { id: current?.courseId ?? "" }] },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    db.user.findMany({
      where: { role: "teacher", OR: [{ active: true }, { id: current?.teacherId ?? "" }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.term.findMany({
      where: { OR: [{ locked: false }, { id: current?.termId ?? "" }] },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
    }),
  ]);
  return { courses, teachers, terms };
}

export async function getGroup(id: string) {
  await getCurrentAdmin();
  const group = await db.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      courseId: true,
      teacherId: true,
      termId: true,
      capacity: true,
      monthlyPrice: true,
      enrollmentOpen: true,
      course: { select: { title: true, showOnWebsite: true, archived: true } },
      term: { select: { name: true, locked: true } },
      teacher: { select: { id: true, name: true, active: true } },
      enrollments: {
        select: {
          id: true,
          status: true,
          student: { select: { id: true, name: true, email: true, active: true } },
        },
      },
      _count: { select: { lessons: true, homework: true, marks: true, finalGrades: true } },
    },
  });
  if (!group) return null;

  const upcoming = { groupId: id, startsAt: { gte: new Date() }, status: { in: ["scheduled", "moved"] as LessonStatus[] } };
  const [lessonsToMove, substituteLessons, available] = await Promise.all([
    db.lesson.count({ where: { ...upcoming, teacherId: group.teacherId } }),
    db.lesson.count({ where: { ...upcoming, teacherId: { not: group.teacherId } } }),
    db.user.findMany({
      where: { role: "student", active: true, enrollments: { none: { groupId: id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  const { lessons, homework, marks, finalGrades } = group._count;
  const enrollments = [...group.enrollments].sort(
    (a, b) => a.status.localeCompare(b.status) || a.student.name.localeCompare(b.student.name),
  );
  return {
    ...group,
    enrollments,
    // Moving a group that has a history would leave it filed under the wrong course or term.
    hasHistory: lessons + homework + marks + finalGrades > 0,
    lessonsToMove,
    substituteLessons,
    available,
  };
}

// One row per student who can get a final grade: everyone still enrolled, plus anyone
// who left after a grade was saved for them.
export async function getGroupGrades(id: string) {
  await getCurrentAdmin();
  const group = await db.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      course: { select: { title: true } },
      term: { select: { id: true, name: true, locked: true } },
      enrollments: {
        select: { status: true, student: { select: { id: true, name: true, active: true } } },
      },
      marks: { select: { studentId: true, value: true, weight: true } },
      finalGrades: { select: { studentId: true, value: true, published: true } },
    },
  });
  if (!group) return null;

  const rows = group.enrollments
    .map(({ status, student }) => {
      const final = group.finalGrades.find((f) => f.studentId === student.id);
      const enrolled = status === "active" && student.active;
      const marks = group.marks.filter((m) => m.studentId === student.id);
      const average = weightedAverage(marks);
      return {
        id: student.id,
        name: student.name,
        enrolled,
        hasGrade: !!final,
        markCount: marks.length,
        average: average === null ? null : Math.round(average * 10) / 10,
        value: final?.value ?? null,
        published: final?.published ?? false,
      };
    })
    .filter((row) => row.enrolled || row.hasGrade)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: group.id,
    name: group.name,
    course: group.course.title,
    term: group.term,
    rows,
  };
}

export async function getGroupSchedule(id: string) {
  await getCurrentAdmin();
  const group = await db.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      course: { select: { title: true } },
      term: { select: { name: true, startDate: true, endDate: true, locked: true } },
      teacher: { select: { name: true, active: true } },
      scheduleRules: { select: { id: true, weekday: true, startTime: true, endTime: true } },
      lessons: {
        where: { meetingUrl: { not: null } },
        orderBy: { startsAt: "desc" },
        take: 1,
        select: { meetingUrl: true },
      },
      _count: { select: { lessons: true } },
    },
  });
  if (!group) return null;
  return {
    ...group,
    scheduleRules: sortRules(group.scheduleRules),
    term: { ...group.term, startDate: termDay(group.term.startDate), endDate: termDay(group.term.endDate) },
    meetingUrl: group.lessons[0]?.meetingUrl ?? "",
  };
}

// ---------- Lessons ----------

// One week of lessons across the school, in the school's timezone.
export async function getCalendar(filters: { date?: unknown; group?: unknown; teacher?: unknown }) {
  await getCurrentAdmin();
  const today = dayKey(new Date(), SCHOOL_TIMEZONE);
  const anchor = isDayKey(filters.date) && addDays(filters.date, 0) === filters.date ? filters.date : today;
  const monday = startOfWeek(anchor);
  const groupId = typeof filters.group === "string" && filters.group ? filters.group : null;
  const teacherId = typeof filters.teacher === "string" && filters.teacher ? filters.teacher : null;

  const [lessons, groups, teachers] = await Promise.all([
    db.lesson.findMany({
      where: {
        startsAt: { gte: startOfDay(monday, SCHOOL_TIMEZONE), lt: startOfDay(addDays(monday, 7), SCHOOL_TIMEZONE) },
        ...(groupId ? { groupId } : {}),
        ...(teacherId ? { teacherId } : {}),
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        teacherId: true,
        teacher: { select: { name: true, active: true } },
        group: { select: { name: true, course: { select: { title: true } } } },
      },
    }),
    db.group.findMany({
      orderBy: [{ term: { startDate: "desc" } }, { name: "asc" }],
      select: { id: true, name: true, term: { select: { name: true } } },
    }),
    db.user.findMany({ where: { role: "teacher" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => ({
    day,
    lessons: lessons
      .filter((l) => dayKey(l.startsAt, SCHOOL_TIMEZONE) === day)
      .map((l) => ({
        id: l.id,
        start: formatTime(l.startsAt, SCHOOL_TIMEZONE),
        end: formatTime(l.endsAt, SCHOOL_TIMEZONE),
        status: l.status,
        teacherId: l.teacherId,
        course: l.group.course.title,
        group: l.group.name,
        teacher: l.teacher.name,
        teacherActive: l.teacher.active,
      })),
  }));
  return { today, monday, days, groups, teachers, groupId, teacherId };
}

export async function getNewLessonOptions() {
  await getCurrentAdmin();
  const today = dayKey(new Date(), SCHOOL_TIMEZONE);
  const groups = await db.group.findMany({
    where: { term: { locked: false, endDate: { gte: new Date(`${today}T00:00:00Z`) } } },
    orderBy: [{ term: { startDate: "desc" } }, { name: "asc" }],
    select: { id: true, name: true, course: { select: { title: true } }, term: { select: { name: true } } },
  });
  return { groups, today };
}

export async function getLesson(id: string) {
  await getCurrentAdmin();
  const lesson = await db.lesson.findUnique({
    where: { id },
    select: {
      id: true,
      groupId: true,
      teacherId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      topic: true,
      meetingUrl: true,
      teacher: { select: { id: true, name: true, active: true } },
      group: {
        select: {
          name: true,
          teacherId: true,
          course: { select: { title: true } },
          term: { select: { name: true, locked: true, startDate: true, endDate: true } },
        },
      },
      _count: { select: { attendance: true, homework: true, marks: true } },
    },
  });
  if (!lesson) return null;
  const now = new Date();
  const state = {
    status: lesson.status,
    startsAt: lesson.startsAt,
    attendance: lesson._count.attendance,
    termLocked: lesson.group.term.locked,
  };
  const [teachers, overlaps] = await Promise.all([
    db.user.findMany({
      where: { role: "teacher", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    lesson.status === "cancelled"
      ? Promise.resolve({ sharedWith: null })
      : findLessonOverlaps({
          groupId: lesson.groupId,
          teacherId: lesson.teacherId,
          start: lesson.startsAt,
          end: lesson.endsAt,
          excludeId: lesson.id,
        }),
  ]);
  return {
    ...lesson,
    day: dayKey(lesson.startsAt, SCHOOL_TIMEZONE),
    start: formatTime(lesson.startsAt, SCHOOL_TIMEZONE),
    end: formatTime(lesson.endsAt, SCHOOL_TIMEZONE),
    termStart: termDay(lesson.group.term.startDate),
    termEnd: termDay(lesson.group.term.endDate),
    teachers,
    sharedWith: overlaps.sharedWith,
    isSubstitute: lesson.teacherId !== lesson.group.teacherId,
    blocks: {
      move: moveBlock(state),
      cancel: cancelBlock(state),
      restore: lesson.status === "cancelled" ? restoreBlock(state, now) : null,
      teacher: teacherBlock(state, now),
      link: linkBlock(state),
    },
  };
}

// ---------- Terms ----------

// Newest first. "current" follows the Diary's rule: the term containing today, or else
// the latest one that has started. If terms overlap, the newest one wins there too.
export async function getTerms() {
  await getCurrentAdmin();
  const terms = await db.term.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { groups: true } } },
  });
  const rows = terms.map((t) => ({
    id: t.id,
    name: t.name,
    startDate: termDay(t.startDate),
    endDate: termDay(t.endDate),
    locked: t.locked,
    groups: t._count.groups,
  }));
  const today = dayKey(new Date(), SCHOOL_TIMEZONE);
  const current =
    rows.find((t) => t.startDate <= today && today <= t.endDate) ?? rows.find((t) => t.startDate <= today);
  return rows.map((term) => ({
    ...term,
    current: term.id === current?.id,
    upcoming: term.startDate > today,
    overlaps: rows
      .filter((o) => o.id !== term.id && o.startDate <= term.endDate && term.startDate <= o.endDate)
      .map((o) => o.name),
  }));
}

export async function getTerm(id: string) {
  await getCurrentAdmin();
  const term = await db.term.findUnique({ where: { id } });
  if (!term) return null;
  return {
    id: term.id,
    name: term.name,
    startDate: termDay(term.startDate),
    endDate: termDay(term.endDate),
    locked: term.locked,
  };
}

// What is still open before this term should be locked. These are warnings: the admin decides.
export async function getTermChecklist(id: string) {
  await getCurrentAdmin();
  const term = await db.term.findUnique({ where: { id }, select: { endDate: true } });
  if (!term) return null;
  const now = new Date();
  const groups = await db.group.findMany({
    where: { termId: id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      course: { select: { title: true } },
      enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
      finalGrades: { select: { studentId: true, published: true } },
      _count: {
        select: {
          lessons: { where: { status: { in: ["scheduled", "moved"] }, endsAt: { lt: now }, attendance: { none: {} } } },
        },
      },
    },
  });
  const rows = groups.map((group) => {
    const published = new Set(group.finalGrades.filter((f) => f.published).map((f) => f.studentId));
    return {
      id: group.id,
      name: group.name,
      course: group.course.title,
      students: group.enrollments.length,
      published: group.enrollments.filter((e) => published.has(e.studentId)).length,
      drafts: group.finalGrades.filter((f) => !f.published).length,
      lessonsWithoutAttendance: group._count.lessons,
    };
  });
  return {
    ended: termDay(term.endDate) < dayKey(now, SCHOOL_TIMEZONE),
    groups: rows,
    missingGrades: rows.reduce((sum, g) => sum + g.students - g.published, 0),
    drafts: rows.reduce((sum, g) => sum + g.drafts, 0),
    lessonsWithoutAttendance: rows.reduce((sum, g) => sum + g.lessonsWithoutAttendance, 0),
  };
}

// ---------- Applications (sent from the public website) ----------

const APPLICATIONS_PER_PAGE = 50;
const APPLICATION_STATUSES = ["new", "contacted", "approved", "rejected"] as const;
export type ApplicationStatusFilter = (typeof APPLICATION_STATUSES)[number];
const isApplicationStatus = (value: unknown): value is ApplicationStatusFilter =>
  (APPLICATION_STATUSES as readonly unknown[]).includes(value);

// Seats still free in a group, or null when the group has no limit.
const seatsLeft = (capacity: number | null, enrolled: number) => (capacity === null ? null : Math.max(0, capacity - enrolled));
const activeEnrolments = { enrollments: { where: { status: "active" as const, student: { active: true } } } };

// Shown next to "Applications" in the navigation.
export async function getNewApplicationCount() {
  await getCurrentAdmin();
  return db.application.count({ where: { status: "new" } });
}

export async function getApplications(filters: { status?: unknown; group?: unknown; page?: unknown }) {
  const admin = await getCurrentAdmin();
  const status = isApplicationStatus(filters.status) ? filters.status : null;
  const groupId = typeof filters.group === "string" && filters.group ? filters.group : null;
  const where: Prisma.ApplicationWhereInput = { ...(status ? { status } : {}), ...(groupId ? { groupId } : {}) };

  const [total, groups] = await Promise.all([
    db.application.count({ where }),
    db.group.findMany({
      where: { applications: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, course: { select: { title: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / APPLICATIONS_PER_PAGE));
  const requested = Number(filters.page);
  const page = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, pages) : 1;
  const rows = await db.application.findMany({
    where,
    // New ones first, then the oldest of them: nobody should wait longest for a call.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    skip: (page - 1) * APPLICATIONS_PER_PAGE,
    take: APPLICATIONS_PER_PAGE,
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      createdAt: true,
      group: {
        select: { id: true, name: true, capacity: true, course: { select: { title: true } }, _count: { select: activeEnrolments } },
      },
    },
  });
  const applications = rows.map(({ group, ...row }) => ({
    ...row,
    group: { id: group.id, name: group.name, course: group.course.title, seatsLeft: seatsLeft(group.capacity, group._count.enrollments) },
  }));
  return { applications, groups, status, groupId, page, pages, total, timezone: admin.timezone };
}

export async function getApplication(id: string) {
  const admin = await getCurrentAdmin();
  const application = await db.application.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isMinor: true,
      guardianName: true,
      guardianPhone: true,
      note: true,
      locale: true,
      status: true,
      createdAt: true,
      handledAt: true,
      handler: { select: { name: true } },
      student: { select: { id: true, name: true } },
      group: {
        select: {
          id: true,
          name: true,
          capacity: true,
          course: { select: { title: true } },
          term: { select: { name: true, locked: true } },
          teacher: { select: { name: true } },
          _count: { select: activeEnrolments },
        },
      },
    },
  });
  if (!application) return null;
  // Tells the admin before they press Approve whether an account will be created or reused.
  const account = await db.user.findUnique({
    where: { email: application.email },
    select: { id: true, name: true, role: true, active: true },
  });
  const { group } = application;
  return {
    ...application,
    account,
    seatsLeft: seatsLeft(group.capacity, group._count.enrollments),
    timezone: admin.timezone,
  };
}
