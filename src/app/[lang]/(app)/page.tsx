import type { Metadata } from "next";
import Link from "next/link";
import { getDashboard } from "@/lib/data";
import { formatDayKey } from "@/lib/dates";
import { formatAverage } from "@/lib/grading";
import { fmt, getI18n, plural } from "@/i18n";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { Badge, Card, Empty, PageTitle, Section } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.dashboard };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function DashboardPage() {
  return <Dashboard />;
}

type Row = Awaited<ReturnType<typeof getDashboard>>["todayLessons"][number];

function LessonRows({
  rows,
  showDay,
  locale,
  t,
}: {
  rows: Row[];
  showDay?: boolean;
  locale: Locale;
  t: Dictionary;
}) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={localePath(locale, `/lessons/${row.id}`)}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-2"
            >
              {showDay && (
                <span className="text-sm first-letter:uppercase">
                  {formatDayKey(row.day, locale, { weekday: "short", month: "short" })}
                </span>
              )}
              <span className="font-mono text-sm font-bold">
                {row.start}–{row.end}
              </span>
              <span className="min-w-0 flex-1 basis-40 truncate text-sm">
                <span className="font-semibold">{row.course}</span> <span className="text-muted">· {row.group}</span>
              </span>
              <span className="text-sm text-muted">{row.teacher}</span>
              {row.status === "moved" && <Badge tone="warn">{t.lesson.status.moved}</Badge>}
              {row.status === "cancelled" && <Badge tone="bad">{t.lesson.status.cancelled}</Badge>}
              {row.status === "done" && <Badge tone="good">{t.lesson.status.done}</Badge>}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Shows how many more there are than fit in the list.
function More({ shown, total, text }: { shown: number; total: number; text: string }) {
  return total > shown ? <p className="mt-1 text-xs text-muted">{fmt(text, { n: total - shown })}</p> : null;
}

async function Dashboard() {
  const [{ locale, t }, data] = await Promise.all([getI18n(), getDashboard()]);
  const { counts, todayLessons, notMarked, noTeacher, atRisk, deletionRequests, termName } = data;
  const tiles = [
    [t.dashboard.courses, counts.courses, "/courses"],
    [t.dashboard.teachers, counts.teachers, "/users?role=teacher&status=active"],
    [t.dashboard.students, counts.students, "/users?role=student&status=active"],
    [t.dashboard.groups, counts.groups, "/groups"],
    [t.dashboard.upcomingLessons, counts.upcomingLessons, "/schedule"],
  ] as const;

  return (
    <>
      <PageTitle title={fmt(t.dashboard.greeting, { name: data.adminName.split(" ")[0] })} />
      {deletionRequests > 0 && (
        <Link
          href={localePath(locale, "/users?status=deletion")}
          className="mb-4 block rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn"
        >
          {plural(locale, t.users.deletionBanner, deletionRequests)}
        </Link>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, value, path]) => (
          <Link key={label} href={localePath(locale, path)}>
            <Card className="h-full hover:bg-surface-2">
              <p className="font-mono text-2xl font-bold">{value}</p>
              <p className="mt-0.5 text-sm text-muted">{label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Section title={t.dashboard.today}>
        {todayLessons.length === 0 ? (
          <Empty>{t.dashboard.noLessonsToday}</Empty>
        ) : (
          <LessonRows rows={todayLessons} locale={locale} t={t} />
        )}
      </Section>

      <Section title={fmt(t.dashboard.notMarked, { n: notMarked.total })}>
        {notMarked.total === 0 ? (
          <Empty>{t.dashboard.notMarkedNone}</Empty>
        ) : (
          <>
            <LessonRows rows={notMarked.rows} showDay locale={locale} t={t} />
            <More shown={notMarked.rows.length} total={notMarked.total} text={t.dashboard.more} />
          </>
        )}
      </Section>

      <Section title={fmt(t.dashboard.noTeacher, { n: noTeacher.total })}>
        {noTeacher.total === 0 ? (
          <Empty>{t.dashboard.noTeacherNone}</Empty>
        ) : (
          <>
            <LessonRows rows={noTeacher.rows} showDay locale={locale} t={t} />
            <More shown={noTeacher.rows.length} total={noTeacher.total} text={t.dashboard.more} />
          </>
        )}
      </Section>

      <Section title={fmt(t.dashboard.atRisk, { n: atRisk.total, term: termName ?? "—" })}>
        {atRisk.total === 0 ? (
          <Empty>{t.dashboard.atRiskNone}</Empty>
        ) : (
          <>
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {atRisk.rows.map((s) => (
                  <li key={`${s.groupId}:${s.id}`}>
                    <Link
                      href={localePath(locale, `/groups/${s.groupId}`)}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 basis-48 truncate text-sm">
                        <span className="font-semibold">{s.name}</span>{" "}
                        <span className="text-muted">
                          · {s.course} · {s.group}
                        </span>
                      </span>
                      {s.attendanceLevel !== "ok" && s.attendanceRate !== null && (
                        <Badge tone={s.attendanceLevel === "risk" ? "bad" : "warn"}>
                          {fmt(t.dashboard.attendance, { n: Math.round(s.attendanceRate * 100) })}
                        </Badge>
                      )}
                      {s.lowAverage && s.average !== null && (
                        <Badge tone="bad">{fmt(t.dashboard.average, { n: formatAverage(s.average) })}</Badge>
                      )}
                      {s.tooManyMissed && <Badge tone="warn">{plural(locale, t.dashboard.missed, s.missed)}</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <More shown={atRisk.rows.length} total={atRisk.total} text={t.dashboard.more} />
          </>
        )}
      </Section>
    </>
  );
}
