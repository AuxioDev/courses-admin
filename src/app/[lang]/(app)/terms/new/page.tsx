import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentAdmin } from "@/lib/auth";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { TermForm } from "@/components/term-form";
import { Card } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.terms.new };
}

// Waiting for the session check on the server beats flashing a skeleton first.
export const instant = false;

export default function NewTermPage() {
  return <NewTerm />;
}

async function NewTerm() {
  const [{ locale, t }] = await Promise.all([getI18n(), getCurrentAdmin()]);
  return (
    <div className="max-w-2xl">
      <Link href={localePath(locale, "/terms")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.nav.terms}
      </Link>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t.terms.new}</h1>
      <Card>
        <TermForm labels={t.terms} errors={t.errors} />
      </Card>
    </div>
  );
}
