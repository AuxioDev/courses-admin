import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGroupSchedule } from "@/lib/data";
import { formatDayKey } from "@/lib/dates";
import { SCHOOL_TIMEZONE } from "@/lib/school";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { ScheduleEditor } from "@/components/schedule-editor";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.schedule.title };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function GroupSchedulePage({ params }: PageProps<"/[lang]/groups/[id]/schedule">) {
  return <GroupSchedule params={params} />;
}

async function GroupSchedule({ params }: Pick<PageProps<"/[lang]/groups/[id]/schedule">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const group = await getGroupSchedule(id);
  if (!group) notFound();
  const day = (key: string) => formatDayKey(key, locale, { weekday: undefined, year: "numeric" });

  return (
    <div className="max-w-3xl">
      <Link href={localePath(locale, `/groups/${group.id}`)} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {group.name}
      </Link>
      <PageTitle
        title={t.schedule.title}
        subtitle={`${group.course.title} · ${group.term.name}: ${day(group.term.startDate)} – ${day(group.term.endDate)}`}
      />
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {group.teacher.name}
        {!group.teacher.active && <Badge tone="bad">{t.users.status.deactivated}</Badge>}
      </p>
      {group.term.locked && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.groups.lockedNotice}</p>}
      <Card>
        <ScheduleEditor
          groupId={group.id}
          initialRules={group.scheduleRules}
          initialMeetingUrl={group.meetingUrl}
          disabled={group.term.locked}
          timezone={SCHOOL_TIMEZONE}
          locale={locale}
          labels={t.schedule}
          errors={t.errors}
        />
      </Card>
    </div>
  );
}
