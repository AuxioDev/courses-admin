import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { getApplications } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Empty, PageTitle, type Tone } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.applications };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

const applicationTone: Record<"new" | "contacted" | "approved" | "rejected", Tone> = {
  new: "warn",
  contacted: "accent",
  approved: "good",
  rejected: "neutral",
};

export default function ApplicationsPage({ searchParams }: PageProps<"/[lang]/applications">) {
  return <Applications searchParams={searchParams} />;
}

async function Applications({ searchParams }: Pick<PageProps<"/[lang]/applications">, "searchParams">) {
  const [{ locale, t }, params] = await Promise.all([getI18n(), searchParams]);
  const { applications, groups, status, groupId, page, pages, timezone } = await getApplications(params);
  const a = t.applications;
  const pageHref = (target: number) => {
    const query = new URLSearchParams({
      ...(status ? { status } : {}),
      ...(groupId ? { group: groupId } : {}),
      ...(target > 1 ? { page: String(target) } : {}),
    }).toString();
    return localePath(locale, `/applications${query ? `?${query}` : ""}`);
  };

  return (
    <>
      <PageTitle title={t.nav.applications} subtitle={a.subtitle} />
      {/* The key resets the fields when a link changes the filters. */}
      <Form key={`${status}-${groupId}`} action={localePath(locale, "/applications")} className="mb-3 grid gap-2 md:grid-cols-[13rem_minmax(0,20rem)_auto] md:justify-start">
        <select name="status" defaultValue={status ?? ""} aria-label={a.statusLabel} className="field">
          <option value="">{a.allStatuses}</option>
          {(["new", "contacted", "approved", "rejected"] as const).map((s) => (
            <option key={s} value={s}>
              {a.status[s]}
            </option>
          ))}
        </select>
        <select name="group" defaultValue={groupId ?? ""} aria-label={a.group} className="field">
          <option value="">{a.allGroups}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.course.title} · {g.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost">
          {t.users.filter}
        </button>
      </Form>
      {applications.length === 0 ? (
        <Empty>{status || groupId ? a.noneFiltered : a.none}</Empty>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {applications.map((row) => (
              <li key={row.id}>
                <Link
                  href={localePath(locale, `/applications/${row.id}`)}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-semibold">{row.name}</p>
                    <p className="truncate text-sm text-muted">{row.phone}</p>
                  </div>
                  <div className="min-w-0 flex-1 basis-56 text-sm">
                    <p className="truncate">
                      {row.group.course} · {row.group.name}
                    </p>
                    <p className={row.group.seatsLeft === 0 ? "text-bad" : "text-muted"}>
                      {row.group.seatsLeft === null ? a.noLimit : fmt(a.seatsLeft, { n: row.group.seatsLeft })}
                    </p>
                  </div>
                  <p className="font-mono text-xs text-muted">{formatDateTime(row.createdAt, timezone, locale)}</p>
                  <Badge tone={applicationTone[row.status]}>{a.status[row.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {pages > 1 && (
        <nav className="mt-3 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className="btn-ghost">{t.users.previous}</Link> : <span />}
          <span className="text-muted">
            {page} / {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)} className="btn-ghost">{t.users.next}</Link> : <span />}
        </nav>
      )}
    </>
  );
}
