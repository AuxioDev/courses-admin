import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentAdmin } from "@/lib/auth";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { StudentImport } from "@/components/student-import";
import { Card } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.users.import };
}

// Waiting for the session check on the server beats flashing a skeleton first.
export const instant = false;

export default function ImportUsersPage() {
  return <ImportUsers />;
}

async function ImportUsers() {
  const [{ locale, t }] = await Promise.all([getI18n(), getCurrentAdmin()]);
  return (
    <div className="max-w-3xl">
      <Link href={localePath(locale, "/users")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.nav.users}
      </Link>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t.users.import}</h1>
      <Card>
        <StudentImport labels={t.users} errors={t.errors} />
      </Card>
    </div>
  );
}
