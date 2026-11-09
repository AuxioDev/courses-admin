import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCourse } from "@/lib/data";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { CourseForm } from "@/components/course-form";
import { Card } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.courses.editTitle };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function EditCoursePage({ params }: PageProps<"/[lang]/courses/[id]/edit">) {
  return <EditCourse params={params} />;
}

async function EditCourse({ params }: Pick<PageProps<"/[lang]/courses/[id]/edit">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const course = await getCourse(id);
  if (!course) notFound();

  return (
    <div className="max-w-2xl">
      <Link href={localePath(locale, "/courses")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.nav.courses}
      </Link>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t.courses.editTitle}</h1>
      <Card>
        <CourseForm course={course} labels={t.courses} errors={t.errors} />
      </Card>
    </div>
  );
}
