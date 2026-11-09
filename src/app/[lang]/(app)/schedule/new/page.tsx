import Link from "next/link";
import type { Metadata } from "next";
import { getNewLessonOptions } from "@/lib/data";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { NewLessonForm } from "@/components/lesson-forms";
import { Card, Empty } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.calendar.newLesson };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function NewLessonPage({ searchParams }: PageProps<"/[lang]/schedule/new">) {
  return <NewLesson searchParams={searchParams} />;
}

async function NewLesson({ searchParams }: Pick<PageProps<"/[lang]/schedule/new">, "searchParams">) {
  const [{ locale, t }, params] = await Promise.all([getI18n(), searchParams]);
  const { groups, today } = await getNewLessonOptions();
  const selected = typeof params.group === "string" ? params.group : undefined;
  return (
    <div className="max-w-2xl">
      <Link href={localePath(locale, "/schedule")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.nav.schedule}
      </Link>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t.calendar.newLesson}</h1>
      {groups.length === 0 ? (
        <Empty>{t.calendar.noGroups}</Empty>
      ) : (
        <Card>
          <NewLessonForm groups={groups} selectedGroup={selected} today={today} labels={t.lesson} errors={t.errors} ok={t.ok} />
        </Card>
      )}
    </div>
  );
}
