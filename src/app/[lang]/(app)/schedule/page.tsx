import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { getCalendar } from "@/lib/data";
import { addDays, formatDayKey } from "@/lib/dates";
import { SCHOOL_TIMEZONE } from "@/lib/school";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, PageTitle } from "@/components/ui";
import { WeekGrid } from "@/components/week-grid";
import { placeDay } from "@/lib/schedule-grid";
import { ChevronLeft, ChevronRight } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.schedule };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function SchedulePage({ searchParams }: PageProps<"/[lang]/schedule">) {
  return <Schedule searchParams={searchParams} />;
}

async function Schedule({ searchParams }: Pick<PageProps<"/[lang]/schedule">, "searchParams">) {
  const [{ locale, t }, params] = await Promise.all([getI18n(), searchParams]);
  const { today, monday, days, groups, teachers, groupId, teacherId } = await getCalendar(params);

  const hrefFor = (date: string | null) => {
    const query = new URLSearchParams({
      ...(date ? { date } : {}),
      ...(groupId ? { group: groupId } : {}),
      ...(teacherId ? { teacher: teacherId } : {}),
    }).toString();
    return localePath(locale, `/schedule${query ? `?${query}` : ""}`);
  };
  const short = { weekday: undefined, month: "short" } as const;
  // Each day laid out once: the time-axis grid (wide screens) uses the columns, both views use the double-booking flag.
  const placed = days.map(({ day, lessons }) => ({ day, lessons: placeDay(lessons) }));
  const clashes = new Set(placed.flatMap((d) => d.lessons.filter((l) => l.clash).map((l) => l.id)));
  const newHref = localePath(locale, `/schedule/new${groupId ? `?group=${groupId}` : ""}`);

  return (
    <>
      <PageTitle
        title={t.nav.schedule}
        subtitle={fmt(t.calendar.timezoneHint, { timezone: SCHOOL_TIMEZONE })}
        action={
          <Link href={newHref} className="btn">
            {t.calendar.newLesson}
          </Link>
        }
      />
      <Form
        key={`${groupId}-${teacherId}`}
        action={localePath(locale, "/schedule")}
        className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <input type="hidden" name="date" value={monday} />
        <select name="group" defaultValue={groupId ?? ""} aria-label={t.calendar.group} className="field">
          <option value="">{t.calendar.allGroups}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} · {g.term.name}
            </option>
          ))}
        </select>
        <select name="teacher" defaultValue={teacherId ?? ""} aria-label={t.calendar.teacher} className="field">
          <option value="">{t.calendar.allTeachers}</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost">
          {t.calendar.filter}
        </button>
      </Form>

      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href={hrefFor(addDays(monday, -7))} aria-label={t.calendar.previousWeek} className="btn-ghost">
          <ChevronLeft width={18} height={18} />
        </Link>
        <div className="text-center">
          <p className="font-semibold">
            {formatDayKey(monday, locale, short)} – {formatDayKey(addDays(monday, 6), locale, short)}
          </p>
          <Link href={hrefFor(null)} className="text-xs text-accent">
            {t.calendar.thisWeek}
          </Link>
        </div>
        <Link href={hrefFor(addDays(monday, 7))} aria-label={t.calendar.nextWeek} className="btn-ghost">
          <ChevronRight width={18} height={18} />
        </Link>
      </div>

      {clashes.size > 0 && (
        <p role="status" className="mb-3 rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad">
          {fmt(t.calendar.clashSummary, { n: clashes.size })}
        </p>
      )}

      <WeekGrid days={placed} today={today} locale={locale} clashLabel={t.calendar.clash} />

      {/* On a phone (and a tablet) the week is a list of days: a time axis needs the width. */}
      <div className="grid gap-2 lg:hidden">
        {days.map(({ day, lessons }) => (
          <section key={day} className="min-w-0">
            <h2 className={`mb-1 text-xs font-semibold first-letter:uppercase ${day === today ? "text-accent" : "text-muted"}`}>
              {formatDayKey(day, locale, { weekday: "short", month: "short" })}
            </h2>
            {lessons.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="space-y-2">
                {lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link
                      href={localePath(locale, `/lessons/${lesson.id}`)}
                      className="block rounded-xl border border-line bg-surface p-2 text-xs hover:bg-surface-2"
                    >
                      <p className={`font-mono font-bold ${lesson.status === "cancelled" ? "text-muted line-through" : ""}`}>
                        {lesson.start}–{lesson.end}
                      </p>
                      <p className="truncate text-sm font-semibold">{lesson.course}</p>
                      <p className="truncate text-muted">{lesson.group}</p>
                      <p className={`truncate ${lesson.teacherActive ? "text-muted" : "text-bad"}`}>{lesson.teacher}</p>
                      {clashes.has(lesson.id) && <Badge tone="bad">{t.calendar.clash}</Badge>}
                      {lesson.status === "moved" && <Badge tone="warn">{t.lesson.status.moved}</Badge>}
                      {lesson.status === "cancelled" && <Badge tone="bad">{t.lesson.status.cancelled}</Badge>}
                      {lesson.status === "done" && <Badge tone="good">{t.lesson.status.done}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
