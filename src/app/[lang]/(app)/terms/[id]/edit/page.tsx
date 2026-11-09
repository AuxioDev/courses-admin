import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTerm, getTermChecklist } from "@/lib/data";
import { fmt, getI18n, plural } from "@/i18n";
import { localePath } from "@/i18n/config";
import { TermForm } from "@/components/term-form";
import { TermLockButton } from "@/components/final-grades-form";
import { Badge, Card, Section } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.terms.editTitle };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function EditTermPage({ params }: PageProps<"/[lang]/terms/[id]/edit">) {
  return <EditTerm params={params} />;
}

async function EditTerm({ params }: Pick<PageProps<"/[lang]/terms/[id]/edit">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const [term, checklist] = await Promise.all([getTerm(id), getTermChecklist(id)]);
  if (!term || !checklist) notFound();

  const open = [
    !checklist.ended ? t.terms.notEnded : null,
    checklist.missingGrades > 0 ? plural(locale, t.terms.missingGrades, checklist.missingGrades) : null,
    checklist.drafts > 0 ? plural(locale, t.terms.draftGrades, checklist.drafts) : null,
    checklist.lessonsWithoutAttendance > 0
      ? plural(locale, t.terms.lessonsWithoutAttendance, checklist.lessonsWithoutAttendance)
      : null,
  ].filter((item): item is string => item !== null);

  return (
    <div className="max-w-3xl">
      <Link href={localePath(locale, "/terms")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.nav.terms}
      </Link>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t.terms.editTitle}</h1>
      {term.locked && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.terms.lockedNotice}</p>}
      <Card className="mb-6">
        <TermForm term={term} labels={t.terms} errors={t.errors} />
      </Card>

      <Section title={t.terms.groupsTitle}>
        {checklist.groups.length === 0 ? (
          <p className="text-sm text-muted">{t.terms.noGroups}</p>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {checklist.groups.map((group) => (
                <li key={group.id}>
                  <Link
                    href={localePath(locale, `/groups/${group.id}/grades`)}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1 basis-48 truncate text-sm">
                      <span className="font-semibold">{group.name}</span>{" "}
                      <span className="text-muted">· {group.course}</span>
                    </span>
                    <Badge tone={group.students > 0 && group.published === group.students ? "good" : "neutral"}>
                      {fmt(t.terms.publishedOf, { n: group.published, total: group.students })}
                    </Badge>
                    {group.drafts > 0 && <Badge tone="warn">{plural(locale, t.terms.draftGrades, group.drafts)}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section title={term.locked ? t.terms.reopenTitle : t.terms.closeTitle}>
        <Card>
          {term.locked ? (
            <p className="mb-3 text-sm text-muted">{t.terms.reopenHint}</p>
          ) : open.length > 0 ? (
            <>
              <p className="mb-1 text-sm font-medium">{t.terms.stillOpen}</p>
              <ul className="mb-3 list-inside list-disc text-sm text-warn">
                {open.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mb-3 text-sm text-good">{t.terms.allClear}</p>
          )}
          <p className="mb-3 text-xs text-muted">{t.terms.lockHint}</p>
          <TermLockButton
            termId={term.id}
            locked={term.locked}
            confirm={term.locked ? t.terms.unlockConfirm : [t.terms.lockConfirm, ...open].join("\n\n")}
            labels={t.terms}
            errors={t.errors}
            ok={t.ok}
          />
        </Card>
      </Section>
    </div>
  );
}
