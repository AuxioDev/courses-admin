import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminForPasswordChange } from "@/lib/auth";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { NotYou } from "@/components/not-you";
import { PasswordForm } from "@/components/password-form";
import { Skeleton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.password.forcedTitle };
}

// Shown after logging in with a temporary password; nothing else is reachable until
// the admin picks their own. Everyone else changes their password in Profile.
export default async function ChangePasswordPage() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t.password.forcedTitle}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t.password.forcedSubtitle}</p>
      <Suspense fallback={<Skeleton rows={2} />}>
        <ForcedForm />
      </Suspense>
    </main>
  );
}

async function ForcedForm() {
  const [{ locale, t }, admin] = await Promise.all([getI18n(), getAdminForPasswordChange()]);
  if (!admin.mustChangePassword) redirect(localePath(locale, "/profile"));
  return (
    <>
      <PasswordForm mode="forced" username={admin.email} labels={t.password} errors={t.errors} ok={t.ok} />
      <NotYou label={t.password.notYou} />
    </>
  );
}
