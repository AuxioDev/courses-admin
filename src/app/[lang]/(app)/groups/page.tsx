import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { getGroups } from "@/lib/data";
import { getI18n, plural } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Empty, PageTitle } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.groups };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function GroupsPage({ searchParams }: PageProps<"/[lang]/groups">) {
  return <Groups searchParams={searchParams} />;
}

async function Groups({ searchParams }: Pick<PageProps<"/[lang]/groups">, "searchParams">) {
  const [{ locale, t }, params] = await Promise.all([getI18n(), searchParams]);
  const { terms, termId, groups } = await getGroups(params);

  return (
    <>
      <PageTitle
        title={t.nav.groups}
        action={
          <Link href={localePath(locale, "/groups/new")} className="btn">
            {t.groups.new}
          </Link>
        }
      />
      <Form key={termId} action={localePath(locale, "/groups")} className="mb-3 grid gap-2 sm:grid-cols-[16rem_auto] sm:justify-start">
        <select name="term" defaultValue={termId ?? ""} aria-label={t.groups.term} className="field">
          <option value="">{t.groups.allTerms}</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost">
          {t.groups.filter}
        </button>
      </Form>
      {groups.length === 0 ? (
        <Empty
          action={
            <Link href={localePath(locale, "/groups/new")} className="btn">
              {t.groups.new}
            </Link>
          }
        >
          {t.groups.none}
        </Empty>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={localePath(locale, `/groups/${group.id}`)}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {group.name}
                      {group.term.locked && <Badge tone="warn">{t.terms.locked}</Badge>}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {group.course.title} · {group.term.name}
                    </p>
                  </div>
                  <p className="flex items-center gap-2 text-sm">
                    {group.teacher.name}
                    {!group.teacher.active && <Badge tone="bad">{t.users.status.deactivated}</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {plural(locale, t.groups.students, group.enrollments.length)} ·{" "}
                    {plural(locale, t.groups.lessons, group._count.lessons)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
