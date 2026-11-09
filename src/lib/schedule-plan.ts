import "server-only";
import { db } from "./db";
import { addDays, dayKey, formatTime, startOfDay, startOfWeek, weekday, type DayKey } from "./dates";
import { SCHOOL_TIMEZONE } from "./school";
import { slotInstant, type DraftRule } from "./schedule-rules";

const TZ = SCHOOL_TIMEZONE;

export type Clash = { kind: "teacher" | "group"; group: string } | null;
export type CreateRow = {
  id: string; // the start instant, because the lesson doesn't exist yet
  day: DayKey;
  start: string;
  end: string;
  clash: Clash;
  sharedStudentsIn: string | null;
  movedNearby: boolean;
};
export type LessonRow = { id: string; day: DayKey; start: string; end: string };
export type UpdateRow = LessonRow & { newEnd: string; clash: Clash };
export type LeftAloneRow = LessonRow & { reason: "hasWork" | "done" | "moved" };
export type SchedulePlan = {
  rulesChanged: boolean;
  create: CreateRow[];
  remove: LessonRow[];
  update: UpdateRow[];
  leftAlone: LeftAloneRow[];
};

// Lessons don't record which rule made them, so a rule's lessons are found by weekday and local time.
const slotKey = (w: number, time: string) => `${w}|${time}`;
const lessonSlot = (startsAt: Date) => slotKey(weekday(dayKey(startsAt, TZ)), formatTime(startsAt, TZ));
const termDay = (date: Date) => date.toISOString().slice(0, 10);

export async function loadScheduleGroup(groupId: string) {
  return db.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      teacherId: true,
      course: { select: { title: true } },
      teacher: { select: { active: true } },
      term: { select: { startDate: true, endDate: true, locked: true } },
      scheduleRules: { select: { weekday: true, startTime: true, endTime: true } },
      enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
    },
  });
}

type Group = NonNullable<Awaited<ReturnType<typeof loadScheduleGroup>>>;

// Compares the rules the admin wants with what exists. Changes nothing. `assumeRemoved` says
// which lessons to treat as gone when looking for clashes; by default, all that could be removed.
export async function buildSchedulePlan(group: Group, draft: DraftRule[], assumeRemoved?: ReadonlySet<string>) {
  const now = new Date();
  const today = dayKey(now, TZ);
  const termStart = termDay(group.term.startDate);
  const termEnd = termDay(group.term.endDate);
  const from = termStart > today ? termStart : today;

  const lessons =
    from <= termEnd
      ? await db.lesson.findMany({
          where: { groupId: group.id, startsAt: { gte: startOfDay(from, TZ), lt: startOfDay(addDays(termEnd, 1), TZ) } },
          orderBy: { startsAt: "asc" },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            _count: { select: { attendance: true, homework: true, marks: true } },
          },
        })
      : [];

  // ---------- What the rules ask for ----------

  const savedKeys = new Map(group.scheduleRules.map((r) => [slotKey(r.weekday, r.startTime), r]));
  const draftKeys = new Map(draft.map((r) => [slotKey(r.weekday, r.startTime), r]));
  const removedSlots = new Set([...savedKeys.keys()].filter((k) => !draftKeys.has(k)));
  const rulesChanged =
    savedKeys.size !== draftKeys.size ||
    [...draftKeys].some(([key, rule]) => savedKeys.get(key)?.endTime !== rule.endTime);

  const taken = new Set(lessons.map((l) => l.startsAt.getTime()));
  const movedWeeks = new Set(lessons.filter((l) => l.status === "moved").map((l) => startOfWeek(dayKey(l.startsAt, TZ))));
  const wanted: { startsAt: Date; endsAt: Date; day: DayKey; rule: DraftRule }[] = [];
  for (let day = from; day <= termEnd; day = addDays(day, 1)) {
    for (const rule of draft) {
      if (rule.weekday !== weekday(day)) continue;
      const startsAt = slotInstant(day, rule.startTime, TZ);
      if (startsAt <= now || taken.has(startsAt.getTime())) continue;
      wanted.push({ startsAt, endsAt: slotInstant(day, rule.endTime, TZ), day, rule });
    }
  }
  wanted.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // ---------- What happens to lessons that already exist ----------

  const row = (l: (typeof lessons)[number]): LessonRow => ({
    id: l.id,
    day: dayKey(l.startsAt, TZ),
    start: formatTime(l.startsAt, TZ),
    end: formatTime(l.endsAt, TZ),
  });
  const remove: LessonRow[] = [];
  const leftAlone: LeftAloneRow[] = [];
  const toEndChange: { lesson: (typeof lessons)[number]; newEnd: string }[] = [];

  for (const lesson of lessons) {
    if (lesson.startsAt <= now || lesson.status === "cancelled") continue;
    const slot = lessonSlot(lesson.startsAt);
    const draftRule = draftKeys.get(slot);
    const endChanged = !!draftRule && savedKeys.has(slot) && savedKeys.get(slot)!.endTime !== draftRule.endTime;
    if (!removedSlots.has(slot) && !endChanged) continue;

    const { attendance, homework, marks } = lesson._count;
    if (lesson.status === "done") leftAlone.push({ ...row(lesson), reason: "done" });
    else if (lesson.status === "moved") leftAlone.push({ ...row(lesson), reason: "moved" });
    else if (attendance + homework + marks > 0) leftAlone.push({ ...row(lesson), reason: "hasWork" });
    else if (removedSlots.has(slot)) remove.push(row(lesson));
    else toEndChange.push({ lesson, newEnd: draftRule!.endTime });
  }

  // ---------- Clashes ----------

  const gone = assumeRemoved ?? new Set(remove.map((r) => r.id));
  const intervals = [
    ...wanted.map((w) => [w.startsAt, w.endsAt] as const),
    ...toEndChange.map(({ lesson, newEnd }) => [lesson.startsAt, slotInstant(dayKey(lesson.startsAt, TZ), newEnd, TZ)] as const),
  ];
  const studentIds = group.enrollments.map((e) => e.studentId);
  const nearby = intervals.length
    ? await db.lesson.findMany({
        where: {
          status: { not: "cancelled" },
          startsAt: { lt: new Date(Math.max(...intervals.map(([, end]) => end.getTime()))) },
          endsAt: { gt: new Date(Math.min(...intervals.map(([start]) => start.getTime()))) },
          OR: [
            { teacherId: group.teacherId },
            { groupId: group.id },
            { group: { enrollments: { some: { status: "active", studentId: { in: studentIds } } } } },
          ],
        },
        select: {
          id: true,
          groupId: true,
          teacherId: true,
          startsAt: true,
          endsAt: true,
          group: { select: { name: true } },
        },
      })
    : [];

  const overlapping = (start: Date, end: Date, selfId?: string) =>
    nearby.filter((l) => l.id !== selfId && !gone.has(l.id) && l.startsAt < end && l.endsAt > start);
  const clashOf = (hits: typeof nearby): Clash => {
    const sameGroup = hits.find((l) => l.groupId === group.id);
    if (sameGroup) return { kind: "group", group: sameGroup.group.name };
    const teacher = hits.find((l) => l.teacherId === group.teacherId);
    return teacher ? { kind: "teacher", group: teacher.group.name } : null;
  };

  return {
    rulesChanged,
    create: wanted.map(({ startsAt, endsAt, day, rule }) => {
      const hits = overlapping(startsAt, endsAt);
      const clash = clashOf(hits);
      return {
        id: startsAt.toISOString(),
        day,
        start: rule.startTime,
        end: rule.endTime,
        clash,
        sharedStudentsIn: clash ? null : (hits[0]?.group.name ?? null),
        movedNearby: movedWeeks.has(startOfWeek(day)),
      };
    }),
    remove,
    update: toEndChange.map(({ lesson, newEnd }) => ({
      ...row(lesson),
      newEnd,
      clash: clashOf(overlapping(lesson.startsAt, slotInstant(dayKey(lesson.startsAt, TZ), newEnd, TZ), lesson.id)),
    })),
    leftAlone,
  } satisfies SchedulePlan;
}
