import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { FormMessage } from "@/components/form-kit";
import { PasswordForm } from "@/components/password-form";
import { Skeleton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.password.resetTitle, robots: { index: false } };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/[lang]/reset-password">) {
  const { locale, t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t.password.resetTitle}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t.password.resetSubtitle}</p>
      <Suspense fallback={<Skeleton rows={2} label={t.common.loading} />}>
        <ResetForm searchParams={searchParams} />
      </Suspense>
      <Link href={localePath(locale, "/login")} className="mt-6 text-center text-sm text-accent">
        {t.login.submit}
      </Link>
    </main>
  );
}

// The token is only checked when the form is submitted, so a bad link can't be probed.
async function ResetForm({ searchParams }: Pick<PageProps<"/[lang]/reset-password">, "searchParams">) {
  const [{ locale, t }, { token }] = await Promise.all([getI18n(), searchParams]);
  if (typeof token !== "string" || !token) {
    return (
      <div className="space-y-3">
        <FormMessage kind="error">{t.errors.resetLinkInvalid}</FormMessage>
        <Link href={localePath(locale, "/forgot-password")} className="inline-flex min-h-11 items-center text-sm text-accent hover:underline">
          {t.forgot.title}
        </Link>
      </div>
    );
  }
  return <PasswordForm mode="reset" token={token} labels={t.password} errors={t.errors} ok={t.ok} />;
}
