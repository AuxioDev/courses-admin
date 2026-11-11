import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getApplication } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, PageTitle, type Tone } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { ApplicationActions } from "@/components/application-actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.applications };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

const tone: Record<"new" | "contacted" | "approved" | "rejected", Tone> = {
  new: "warn",
  contacted: "accent",
  approved: "good",
  rejected: "neutral",
};

export default function ApplicationPage({ params }: PageProps<"/[lang]/applications/[id]">) {
  return <Application params={params} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

async function Application({ params }: Pick<PageProps<"/[lang]/applications/[id]">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const application = await getApplication(id);
  if (!application) notFound();
  const a = t.applications;
  const { group, account } = application;
  const open = application.status === "new" || application.status === "contacted";

  // Said before the admin presses Approve, so nothing about the result is a surprise.
  const cannotApprove = group.term.locked
    ? t.errors.termLocked
    : account && (account.role !== "student" || !account.active)
      ? t.errors.applicationEmailInUse
      : application.seatsLeft === 0
        ? t.errors.groupFull
        : null;
  const approveHint = account ? fmt(a.approveReuses, { name: account.name }) : a.approveCreates;

  return (
    <div className="max-w-4xl">
      <Link href={localePath(locale, "/applications")} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {t.nav.applications}
      </Link>
      <PageTitle
        title={application.name}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={tone[application.status]}>{a.status[application.status]}</Badge>
            <span>{formatDateTime(application.createdAt, application.timezone, locale)}</span>
          </span>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-sm font-semibold">{a.contact}</h2>
          <dl className="divide-y divide-line">
            <Row label={a.phone}>
              <a href={`tel:${application.phone}`} className="font-medium text-accent">
                {application.phone}
              </a>
            </Row>
            <Row label={a.email}>
              <a href={`mailto:${application.email}`} className="font-medium text-accent">
                {application.email}
              </a>
            </Row>
            <Row label={a.age}>{application.isMinor ? a.minor : a.adult}</Row>
            {application.guardianName && <Row label={a.guardianName}>{application.guardianName}</Row>}
            {application.guardianPhone && (
              <Row label={a.guardianPhone}>
                <a href={`tel:${application.guardianPhone}`} className="font-medium text-accent">
                  {application.guardianPhone}
                </a>
              </Row>
            )}
            <Row label={a.language}>{application.locale.toUpperCase()}</Row>
            {application.note && <Row label={a.note}>{application.note}</Row>}
          </dl>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-1 text-sm font-semibold">{a.group}</h2>
            <dl className="divide-y divide-line">
              <Row label={a.group}>
                <Link href={localePath(locale, `/groups/${group.id}`)} className="font-medium text-accent">
                  {group.course.title} · {group.name}
                </Link>
              </Row>
              <Row label={t.groups.teacher}>{group.teacher.name}</Row>
              <Row label={t.groups.term}>{group.term.name}</Row>
              <Row label={a.seats}>
                <span className={application.seatsLeft === 0 ? "font-medium text-bad" : ""}>
                  {application.seatsLeft === null ? a.noLimit : fmt(a.seatsLeft, { n: application.seatsLeft })}
                </span>
              </Row>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{a.decision}</h2>
            {open ? (
              <>
                {cannotApprove && <p className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{cannotApprove}</p>}
                <ApplicationActions
                  locale={locale}
                  applicationId={application.id}
                  status={application.status as "new" | "contacted"}
                  approveHint={approveHint}
                  labels={a}
                  userLabels={t.users}
                  errors={t.errors}
                  ok={t.ok}
                />
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <p>
                  {fmt(application.status === "approved" ? a.approvedBy : a.rejectedBy, {
                    name: application.handler?.name ?? "—",
                    date: application.handledAt ? formatDateTime(application.handledAt, application.timezone, locale) : "—",
                  })}
                </p>
                {application.student && (
                  <Link href={localePath(locale, `/users/${application.student.id}`)} className="btn-ghost">
                    {application.student.name}
                  </Link>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
