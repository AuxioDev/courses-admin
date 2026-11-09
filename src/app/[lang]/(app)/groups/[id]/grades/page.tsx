import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGroupGrades } from "@/lib/data";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Card, Empty, PageTitle } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { FinalGradesForm } from "@/components/final-grades-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.grades.title };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function GroupGradesPage({ params }: PageProps<"/[lang]/groups/[id]/grades">) {
  return <GroupGrades params={params} />;
}

async function GroupGrades({ params }: Pick<PageProps<"/[lang]/groups/[id]/grades">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const group = await getGroupGrades(id);
  if (!group) notFound();

  return (
    <div className="max-w-3xl">
      <Link href={localePath(locale, `/groups/${group.id}`)} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {group.name}
      </Link>
      <PageTitle title={t.grades.title} subtitle={`${group.course} · ${group.term.name}`} />
      {group.term.locked && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.groups.lockedNotice}</p>}
      <p className="mb-3 text-sm text-muted">{t.grades.hint}</p>
      {group.rows.length === 0 ? (
        <Empty>{t.grades.none}</Empty>
      ) : (
        <Card>
          <FinalGradesForm
            groupId={group.id}
            rows={group.rows}
            locked={group.term.locked}
            labels={t.grades}
            errors={t.errors}
            ok={t.ok}
          />
        </Card>
      )}
    </div>
  );
}
