import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLesson } from "@/lib/data";
import { formatDayKey } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { CancelButton, LinkForm, MoveForm, RestoreButton, TeacherForm } from "@/components/lesson-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.lesson.title };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function LessonPage({ params }: PageProps<"/[lang]/lessons/[id]">) {
  return <Lesson params={params} />;
}

async function Lesson({ params }: Pick<PageProps<"/[lang]/lessons/[id]">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const lesson = await getLesson(id);
  if (!lesson) notFound();

  const text = { labels: t.lesson, errors: t.errors, ok: t.ok };
  const { blocks } = lesson;
  const isCancelled = lesson.status === "cancelled";
  const reason = blocks.move && !isCancelled ? t.errors[blocks.move] : null;

  return (
    <div className="max-w-3xl">
      <Link
        href={localePath(locale, `/schedule?date=${lesson.day}`)}
        className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6"
      >
        <ChevronLeft width={18} height={18} /> {t.nav.schedule}
      </Link>
      <PageTitle
        title={lesson.group.course.title}
        subtitle={`${lesson.group.name} · ${lesson.group.term.name}`}
        action={
          <span className="flex items-center gap-2">
            {lesson.status === "moved" && <Badge tone="warn">{t.lesson.status.moved}</Badge>}
            {isCancelled && <Badge tone="bad">{t.lesson.status.cancelled}</Badge>}
            {lesson.status === "done" && <Badge tone="good">{t.lesson.status.done}</Badge>}
          </span>
        }
      />
      <Card className="mb-4">
        <p className="text-lg font-semibold first-letter:uppercase">{formatDayKey(lesson.day, locale, { year: "numeric" })}</p>
        <p className="font-mono">
          {lesson.start}–{lesson.end}
        </p>
        {lesson.topic && <p className="mt-1 text-sm">{lesson.topic}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Link href={localePath(locale, `/users/${lesson.teacher.id}`)} className="inline-flex min-h-6 items-center text-accent">
            {lesson.teacher.name}
          </Link>
          {lesson.isSubstitute && <Badge tone="warn">{t.lesson.substitute}</Badge>}
          {!lesson.teacher.active && <Badge tone="bad">{t.users.status.deactivated}</Badge>}
        </p>
        <p className="mt-1 text-xs text-muted">
          {fmt(t.lesson.counts, {
            attendance: lesson._count.attendance,
            homework: lesson._count.homework,
            marks: lesson._count.marks,
          })}
        </p>
        <Link href={localePath(locale, `/groups/${lesson.groupId}`)} className="mt-2 inline-flex min-h-11 items-center text-sm text-accent sm:min-h-6">
          {t.lesson.openGroup}
        </Link>
      </Card>

      {lesson.sharedWith && (
        <p className="mb-4 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          {fmt(t.lesson.sharedStudents, { group: lesson.sharedWith })}
        </p>
      )}
      {reason && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{reason}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {!blocks.move && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{t.lesson.moveTitle}</h2>
            <MoveForm
              lessonId={lesson.id}
              values={lesson}
              min={lesson.termStart}
              max={lesson.termEnd}
              {...text}
            />
          </Card>
        )}
        {!blocks.teacher && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{t.lesson.teacher}</h2>
            <TeacherForm
              lessonId={lesson.id}
              currentTeacherId={lesson.teacherId}
              teachers={lesson.teachers}
              {...text}
            />
          </Card>
        )}
        {!blocks.link && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{t.lesson.meetingUrl}</h2>
            <LinkForm lessonId={lesson.id} meetingUrl={lesson.meetingUrl ?? ""} {...text} />
          </Card>
        )}
        {!blocks.cancel && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{t.lesson.cancelTitle}</h2>
            <p className="mb-3 text-xs text-muted">{t.lesson.cancelHint}</p>
            <CancelButton lessonId={lesson.id} {...text} />
          </Card>
        )}
        {isCancelled && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">{t.lesson.restoreTitle}</h2>
            {blocks.restore ? (
              <p className="text-sm text-muted">{t.errors[blocks.restore]}</p>
            ) : (
              <RestoreButton lessonId={lesson.id} {...text} />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
