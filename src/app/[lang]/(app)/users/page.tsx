import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { getUsers } from "@/lib/data";
import { getI18n, plural } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Empty, PageTitle } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.users };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function UsersPage({ searchParams }: PageProps<"/[lang]/users">) {
  return <Users searchParams={searchParams} />;
}

async function Users({ searchParams }: Pick<PageProps<"/[lang]/users">, "searchParams">) {
  const [{ locale, t }, params] = await Promise.all([getI18n(), searchParams]);
  const { users, role, status, q, page, pages, deletionRequests } = await getUsers(params);
  const pageHref = (target: number) => {
    const query = new URLSearchParams({
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      ...(target > 1 ? { page: String(target) } : {}),
    }).toString();
    return localePath(locale, `/users${query ? `?${query}` : ""}`);
  };

  return (
    <>
      <PageTitle
        title={t.nav.users}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Link href={localePath(locale, "/users/import")} className="btn-ghost">
              {t.users.import}
            </Link>
            <Link href={localePath(locale, "/users/new")} className="btn">
              {t.users.new}
            </Link>
          </div>
        }
      />
      {deletionRequests > 0 && status !== "deletion" && (
        <Link
          href={localePath(locale, "/users?status=deletion")}
          className="mb-3 block rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn"
        >
          {plural(locale, t.users.deletionBanner, deletionRequests)}
        </Link>
      )}
      {/* The key resets the fields when a link changes the filters. */}
      <Form key={`${role}-${status}-${q}`} action={localePath(locale, "/users")} className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_11rem_13rem_auto]">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t.users.search}
          aria-label={t.users.search}
          className="field"
        />
        <select name="role" defaultValue={role ?? ""} aria-label={t.users.role} className="field">
          <option value="">{t.users.allRoles}</option>
          <option value="student">{t.users.roles.student}</option>
          <option value="teacher">{t.users.roles.teacher}</option>
          <option value="admin">{t.users.roles.admin}</option>
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label={t.users.statusLabel} className="field">
          <option value="">{t.users.allStatuses}</option>
          <option value="active">{t.users.status.active}</option>
          <option value="deactivated">{t.users.status.deactivated}</option>
          <option value="temp">{t.users.status.temp}</option>
          <option value="deletion">{t.users.status.deletion}</option>
        </select>
        <button type="submit" className="btn-ghost">
          {t.users.filter}
        </button>
      </Form>
      {users.length === 0 ? (
        <Empty>{t.users.none}</Empty>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {users.map((user) => (
              <li key={user.id}>
                <Link
                  href={localePath(locale, `/users/${user.id}`)}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-semibold">{user.name}</p>
                    <p className="truncate text-sm text-muted">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{t.users.roles[user.role]}</Badge>
                    {!user.active && <Badge tone="bad">{t.users.status.deactivated}</Badge>}
                    {user.active && user.mustChangePassword && <Badge tone="warn">{t.users.status.temp}</Badge>}
                    {user.deletionRequestedAt && !user.deletionApprovedAt && (
                      <Badge tone="warn">{t.users.status.deletion}</Badge>
                    )}
                  </div>
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
