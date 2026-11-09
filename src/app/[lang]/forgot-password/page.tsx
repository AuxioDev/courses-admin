import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { ForgotForm } from "./forgot-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.forgot.title };
}

export default async function ForgotPasswordPage() {
  const { locale, t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t.forgot.title}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t.forgot.subtitle}</p>
      <ForgotForm labels={{ ...t.forgot, email: t.login.email }} errors={t.errors} ok={t.ok} />
      <Link href={localePath(locale, "/login")} className="mt-6 text-center text-sm text-accent">
        {t.forgot.back}
      </Link>
    </main>
  );
}
