import Link from "next/link";
import { formatDayKey } from "@/lib/dates";
import { hourRange, type GridLesson, type Placed } from "@/lib/schedule-grid";
import { localePath, type Locale } from "@/i18n/config";

// The week on a time axis: a column for each day, lessons placed by their hours, overlapping lessons side by side.
// Only for wide screens: on a phone the per-day list is the better view, so the page hides this one there.
// Sized in rem, so it scales with everything else on very large screens.
const ROW_REM = 3.5; // one hour
const MIN_BLOCK_REM = 1.75; // a short lesson stays readable and clickable

export type WeekLesson = GridLesson & { course: string; group: string; teacher: string; teacherActive: boolean };

const pad = (h: number) => String(h).padStart(2, "0");

export function WeekGrid({
  days,
  today,
  locale,
  clashLabel,
}: {
  days: { day: string; lessons: Placed<WeekLesson>[] }[];
  today: string;
  locale: Locale;
  clashLabel: string;
}) {
  const { from, to } = hourRange(days.map((d) => d.lessons));
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const height = `${(to - from) * ROW_REM}rem`;
  const columns = "grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";
  const lines = `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${ROW_REM}rem - 1px), var(--line) calc(${ROW_REM}rem - 1px), var(--line) ${ROW_REM}rem)`;

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
      <div className={`${columns} border-b border-line`}>
        <div />
        {days.map(({ day }) => (
          <h2
            key={day}
            className={`border-l border-line px-2 py-2 text-xs font-semibold first-letter:uppercase ${day === today ? "text-accent" : "text-muted"}`}
          >
            {formatDayKey(day, locale, { weekday: "short", month: "short" })}
          </h2>
        ))}
      </div>
      <div className={columns}>
        <div className="relative" style={{ height }} aria-hidden="true">
          {hours.map((hour) => (
            <span
              key={hour}
              className={`absolute right-2 font-mono text-[0.6875rem] text-muted ${hour === from ? "translate-y-1" : "-translate-y-1/2"}`}
              style={{ top: `${(hour - from) * ROW_REM}rem` }}
            >
              {pad(hour)}:00
            </span>
          ))}
        </div>
        {days.map(({ day, lessons }) => (
          <div
            key={day}
            className={`relative border-l border-line ${day === today ? "bg-accent-soft/40" : ""}`}
            style={{ height, backgroundImage: lines }}
          >
            {lessons.map((lesson) => {
              const cancelled = lesson.status === "cancelled";
              const top = (lesson.startMin / 60 - from) * ROW_REM;
              const blockHeight = Math.max(((lesson.endMin - lesson.startMin) / 60) * ROW_REM, MIN_BLOCK_REM);
              // A block that prints everything is named by its own content (a label that repeats it can disagree with it).
              // Side by side, only the start time and the course are printed: the name then begins with those, and the
              // rest (group, teacher, the whole range) follows.
              const label = `${lesson.lanes > 1 ? lesson.start : `${lesson.start}–${lesson.end}`}, ${lesson.course}, ${lesson.group}, ${lesson.teacher}${lesson.lanes > 1 ? `, ${lesson.start}–${lesson.end}` : ""}${lesson.clash ? `. ${clashLabel}` : ""}`;
              return (
                <Link
                  key={lesson.id}
                  href={localePath(locale, `/lessons/${lesson.id}`)}
                  aria-label={lesson.lanes > 1 ? label : undefined}
                  title={label}
                  className={`absolute overflow-hidden rounded-lg border px-1.5 py-1 text-xs leading-snug hover:border-accent ${
                    cancelled
                      ? "border-dashed border-line bg-surface-2 text-muted"
                      : lesson.clash
                        ? "border-bad border-l-4 bg-surface"
                        : "border-line border-l-4 border-l-accent bg-surface"
                  }`}
                  style={{
                    top: `${top}rem`,
                    height: `${blockHeight}rem`,
                    left: `calc(${lesson.lane} / ${lesson.lanes} * 100% + 2px)`,
                    width: `calc(100% / ${lesson.lanes} - 4px)`,
                  }}
                >
                  {/* Side by side, a lesson is too narrow for its whole description: the start time and the course name
                      stay, the rest is in the tooltip and the accessible name. */}
                  <p className={`font-mono font-bold ${cancelled ? "line-through" : ""}`}>
                    {lesson.lanes > 1 ? lesson.start : `${lesson.start}–${lesson.end}`}
                    {lesson.clash && (
                      <span className="ml-1 text-bad" aria-hidden="true">
                        !
                      </span>
                    )}
                  </p>
                  <p className={`font-semibold ${lesson.lanes > 1 ? "line-clamp-2 break-words" : "truncate"}`}>{lesson.course}</p>
                  {lesson.lanes === 1 && (
                    <>
                      <p className="truncate text-muted">{lesson.group}</p>
                      <p className={`truncate ${lesson.teacherActive || cancelled ? "text-muted" : "text-bad"}`}>{lesson.teacher}</p>
                      {lesson.clash && <span className="sr-only">{clashLabel}</span>}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
