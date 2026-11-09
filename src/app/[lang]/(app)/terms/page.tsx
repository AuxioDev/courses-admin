import Link from "next/link";
import type { Metadata } from "next";
import { getTerms } from "@/lib/data";
import { formatDayKey } from "@/lib/dates";
import { fmt, getI18n, plural } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Empty, PageTitle } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.terms };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function TermsPage() {
  return <Terms />;
}

async function Terms() {
  const [{ locale, t }, terms] = await Promise.all([getI18n(), getTerms()]);
  const day = (key: string) => formatDayKey(key, locale, { weekday: undefined, year: "numeric" });

  return (
    <>
      <PageTitle
        title={t.nav.terms}
        action={
          <Link href={localePath(locale, "/terms/new")} className="btn">
            {t.terms.new}
          </Link>
        }
      />
      {terms.length === 0 ? (
        <Empty>{t.terms.none}</Empty>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {terms.map((term) => (
              <li key={term.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {term.name}
                    {term.current && <Badge tone="good">{t.terms.current}</Badge>}
                    {term.upcoming && <Badge>{t.terms.upcoming}</Badge>}
                    {term.locked && <Badge tone="warn">{t.terms.locked}</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {day(term.startDate)} – {day(term.endDate)}
                  </p>
                  {term.overlaps.length > 0 && (
                    <p className="mt-1 text-sm text-warn">{fmt(t.terms.overlaps, { names: term.overlaps.join(", ") })}</p>
                  )}
                </div>
                <p className="text-sm text-muted">{plural(locale, t.terms.groups, term.groups)}</p>
                <Link href={localePath(locale, `/terms/${term.id}/edit`)} className="btn-ghost">
                  {term.locked ? t.terms.view : t.terms.edit}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
