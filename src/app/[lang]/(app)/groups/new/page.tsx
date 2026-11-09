import Link from "next/link";
import type { Metadata } from "next";
import { getGroupOptions } from "@/lib/data";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { GroupForm } from "@/components/group-forms";
import { Card, Empty } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.groups.new };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function NewGroupPage() {
  return <NewGroup />;
}

async function NewGroup() {
  const [{ locale, t }, options] = await Promise.all([getI18n(), getGroupOptions()]);
  const ready = options.courses.length > 0 && options.teachers.length > 0 && options.terms.length > 0;
  return (
    <div className="max-w-2xl">
      <Link href={localePath(locale, "/groups")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.nav.groups}
      </Link>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t.groups.new}</h1>
      {ready ? (
        <Card>
          <GroupForm options={options} labels={t.groups} errors={t.errors} ok={t.ok} />
        </Card>
      ) : (
        <Empty>{t.groups.notReady}</Empty>
      )}
    </div>
  );
}
