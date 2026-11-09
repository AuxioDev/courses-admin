import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { PrivacyNotice } from "@/components/privacy-notice";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.privacy.title };
}

export default async function PrivacyPage() {
  const { locale, t } = await getI18n();
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t.privacy.title}</h1>
      <PrivacyNotice t={t.privacy} />
      <Link href={localePath(locale, "/")} className="mt-8 inline-block text-sm text-accent">
        {t.notFound.back}
      </Link>
    </main>
  );
}
