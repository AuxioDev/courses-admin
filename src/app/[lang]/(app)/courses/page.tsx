import Link from "next/link";
import type { Metadata } from "next";
import { getCourses } from "@/lib/data";
import { getI18n, plural } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, Empty, PageTitle } from "@/components/ui";
import { setCourseArchived } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmForm } from "@/components/confirm-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.courses };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function CoursesPage({ searchParams }: PageProps<"/[lang]/courses">) {
  return <Courses searchParams={searchParams} />;
}

async function Courses({ searchParams }: Pick<PageProps<"/[lang]/courses">, "searchParams">) {
  const [{ locale, t }, params] = await Promise.all([getI18n(), searchParams]);
  const showArchived = params.archived === "1";
  const courses = await getCourses(showArchived);

  return (
    <>
      <PageTitle
        title={t.nav.courses}
        action={
          <Link href={localePath(locale, "/courses/new")} className="btn">
            {t.courses.new}
          </Link>
        }
      />
      <p className="mb-3 text-sm">
        <Link href={localePath(locale, showArchived ? "/courses" : "/courses?archived=1")} className="text-accent">
          {showArchived ? t.courses.hideArchived : t.courses.showArchived}
        </Link>
      </p>
      {courses.length === 0 ? (
        <Empty>{t.courses.none}</Empty>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {courses.map((course) => (
              <li key={course.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {course.title}
                    {course.archived && <Badge>{t.courses.archived}</Badge>}
                  </p>
                  {course.description && <p className="truncate text-sm text-muted">{course.description}</p>}
                </div>
                <p className="text-sm text-muted">{plural(locale, t.courses.groups, course.groups)}</p>
                <div className="flex items-center gap-2">
                  <Link href={localePath(locale, `/courses/${course.id}/edit`)} className="btn-ghost">
                    {t.courses.edit}
                  </Link>
                  <ConfirmForm action={setCourseArchived} message={course.archived ? undefined : t.courses.archiveConfirm} danger={false}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="archived" value={String(!course.archived)} />
                    <SubmitButton className="btn-ghost">{course.archived ? t.courses.restore : t.courses.archive}</SubmitButton>
                  </ConfirmForm>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted">{t.courses.archiveHint}</p>
    </>
  );
}
