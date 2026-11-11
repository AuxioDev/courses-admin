import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGroup, getGroupOptions } from "@/lib/data";
import { fmt, getI18n, plural } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Empty, PageTitle, Section } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { EnrolForm, EnrollmentButton, GroupForm, TeacherChangeForm } from "@/components/group-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.groups };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function GroupPage({ params }: PageProps<"/[lang]/groups/[id]">) {
  return <Group params={params} />;
}

async function Group({ params }: Pick<PageProps<"/[lang]/groups/[id]">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const group = await getGroup(id);
  if (!group) notFound();
  const options = await getGroupOptions(group);

  const locked = group.term.locked;
  const text = { labels: t.groups, errors: t.errors, ok: t.ok };
  const preview = [
    plural(locale, t.groups.teacherPreview, group.lessonsToMove),
    group.substituteLessons > 0 ? plural(locale, t.groups.teacherPreviewSubstitutes, group.substituteLessons) : null,
    t.groups.teacherPreviewAccess,
  ]
    .filter(Boolean)
    .join(" ");
  const activeCount = group.enrollments.filter((e) => e.status === "active").length;

  return (
    <div className="max-w-4xl">
      <Link href={localePath(locale, "/groups")} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {t.nav.groups}
      </Link>
      <PageTitle
        title={group.name}
        subtitle={`${group.course.title} · ${group.term.name}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Link href={localePath(locale, `/schedule?group=${group.id}`)} className="btn-ghost">
              {t.nav.schedule}
            </Link>
            <Link href={localePath(locale, `/groups/${group.id}/grades`)} className="btn-ghost">
              {t.grades.title}
            </Link>
            <Link href={localePath(locale, `/groups/${group.id}/schedule`)} className="btn">
              {t.schedule.title}
            </Link>
          </div>
        }
      />
      {locked && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.groups.lockedNotice}</p>}

      <div className="mb-6 grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t.groups.details}</h2>
          <GroupForm group={group} structureLocked={group.hasHistory} disabled={locked} options={options} {...text} />
        </Card>
        <Card>
          <h2 className="mb-1 text-sm font-semibold">{t.groups.teacher}</h2>
          <p className="mb-3 flex flex-wrap items-center gap-2">
            <Link href={localePath(locale, `/users/${group.teacher.id}`)} className="font-medium text-accent">
              {group.teacher.name}
            </Link>
            {!group.teacher.active && <Badge tone="bad">{t.users.status.deactivated}</Badge>}
          </p>
          {!locked && (
            <TeacherChangeForm
              groupId={group.id}
              currentTeacherId={group.teacherId}
              teachers={options.teachers}
              preview={preview}
              {...text}
            />
          )}
        </Card>
      </div>

      <Section title={plural(locale, t.groups.students, activeCount)}>
        {group.enrollments.length === 0 ? (
          <Empty>{t.groups.noStudents}</Empty>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {group.enrollments.map((enrollment) => (
                <li key={enrollment.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <Link href={localePath(locale, `/users/${enrollment.student.id}`)} className="font-medium">
                      {enrollment.student.name}
                    </Link>
                    <p className="truncate text-xs text-muted">{enrollment.student.email}</p>
                  </div>
                  {enrollment.status === "dropped" && <Badge>{t.groups.dropped}</Badge>}
                  {!enrollment.student.active && <Badge tone="bad">{t.users.status.deactivated}</Badge>}
                  {!locked && enrollment.status === "active" && (
                    <EnrollmentButton
                      enrollmentId={enrollment.id}
                      status="dropped"
                      label={t.groups.drop}
                      confirm={fmt(t.groups.dropConfirm, { name: enrollment.student.name })}
                      errors={t.errors}
                      ok={t.ok}
                    />
                  )}
                  {!locked && enrollment.status === "dropped" && enrollment.student.active && (
                    <EnrollmentButton
                      enrollmentId={enrollment.id}
                      status="active"
                      label={t.groups.reenrol}
                      errors={t.errors}
                      ok={t.ok}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      {!locked && (
        <Section title={t.groups.enrolTitle}>
          {group.available.length === 0 ? (
            <Empty>{t.groups.noneAvailable}</Empty>
          ) : (
            <Card>
              <EnrolForm groupId={group.id} students={group.available} {...text} />
            </Card>
          )}
        </Section>
      )}
    </div>
  );
}
