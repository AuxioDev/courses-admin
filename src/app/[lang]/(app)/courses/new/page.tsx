import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentAdmin } from "@/lib/auth";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { CourseForm } from "@/components/course-form";
import { Card } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.courses.new };
}

// Waiting for the session check on the server beats flashing a skeleton first.
export const instant = false;

export default function NewCoursePage() {
  return <NewCourse />;
}

async function NewCourse() {
  const [{ locale, t }] = await Promise.all([getI18n(), getCurrentAdmin()]);
  return (
    <div className="max-w-2xl">
      <Link href={localePath(locale, "/courses")} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {t.nav.courses}
      </Link>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t.courses.new}</h1>
      <Card>
        <CourseForm labels={t.courses} errors={t.errors} />
      </Card>
    </div>
  );
}
