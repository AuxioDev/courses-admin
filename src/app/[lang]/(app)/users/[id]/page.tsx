import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getUser } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { fmt, getI18n, plural } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import {
  ApproveDeletionButton,
  DeactivateButton,
  ReactivateButton,
  ResetLinkButton,
  TempPasswordButton,
  UserDetailsForm,
} from "@/components/user-actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.users };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function UserPage({ params }: PageProps<"/[lang]/users/[id]">) {
  return <User params={params} />;
}

async function User({ params }: Pick<PageProps<"/[lang]/users/[id]">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const user = await getUser(id);
  if (!user) notFound();

  const text = { labels: t.users, errors: t.errors, ok: t.ok };
  const lessonsWarning =
    user.upcomingLessons > 0 ? plural(locale, t.users.deactivateLessons, user.upcomingLessons) : null;
  const deletionApproved = !!user.deletionApprovedAt;
  const deletionPending = !!user.deletionRequestedAt && !deletionApproved;
  const canReactivate = !user.active && !deletionApproved && !user.privateDataErasedAt;

  return (
    <div className="max-w-3xl">
      <Link href={localePath(locale, "/users")} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {t.nav.users}
      </Link>
      <PageTitle
        title={user.name}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="accent">{t.users.roles[user.role]}</Badge>
            {!user.active && <Badge tone="bad">{t.users.status.deactivated}</Badge>}
            {user.active && user.mustChangePassword && <Badge tone="warn">{t.users.status.temp}</Badge>}
          </span>
        }
      />
      {deletionPending && user.deletionRequestedAt && (
        <Card className="mb-4 border-warn">
          <h2 className="text-sm font-semibold">{t.users.deletionTitle}</h2>
          <p className="mb-3 mt-0.5 text-sm text-muted">
            {fmt(t.users.deletionRequested, {
              date: formatDateTime(user.deletionRequestedAt, user.adminTimezone, locale),
            })}{" "}
            {t.users.deletionHint}
          </p>
          <ApproveDeletionButton userId={user.id} {...text} />
        </Card>
      )}
      {deletionApproved && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.users.deletionApproved}</p>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t.users.details}</h2>
          <UserDetailsForm user={user} {...text} />
        </Card>
        {(user.isSelf || user.active || canReactivate) && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{t.users.access}</h2>
            {user.isSelf ? (
              <p className="text-sm text-muted">{t.users.selfNote}</p>
            ) : (
              <div className="space-y-4">
                {user.active && (
                  <>
                    <div>
                      <TempPasswordButton userId={user.id} labels={t.users} errors={t.errors} />
                      <p className="mt-1 text-xs text-muted">{t.users.newPasswordHint}</p>
                    </div>
                    <div>
                      <ResetLinkButton userId={user.id} {...text} />
                      <p className="mt-1 text-xs text-muted">{t.users.sendLinkHint}</p>
                    </div>
                    <div>
                      <DeactivateButton userId={user.id} warning={lessonsWarning} {...text} />
                      {lessonsWarning && <p className="mt-1 text-xs text-warn">{lessonsWarning}</p>}
                    </div>
                  </>
                )}
                {canReactivate && <ReactivateButton userId={user.id} {...text} />}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
