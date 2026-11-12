import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminForConsent } from "@/lib/auth";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { PrivacyNotice } from "@/components/privacy-notice";
import { Skeleton } from "@/components/ui";
import { acceptPrivacy } from "@/app/actions";
import { NotYou } from "@/components/not-you";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.privacy.acceptTitle };
}

// Shown after login until the current notice is accepted; nothing else is reachable.
export default async function AcceptPrivacyPage() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t.privacy.acceptTitle}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t.privacy.acceptBody}</p>
      <PrivacyNotice t={t.privacy} />
      <Suspense fallback={<Skeleton rows={1} />}>
        <AcceptForm />
      </Suspense>
    </main>
  );
}

async function AcceptForm() {
  const [{ locale, t }, admin] = await Promise.all([getI18n(), getAdminForConsent()]);
  if (admin.privacyAccepted) redirect(localePath(locale, "/"));
  return (
    <>
      <form action={acceptPrivacy} className="mt-6">
        <label className="mb-3 flex items-start gap-3 text-sm">
          <input type="checkbox" name="confirmResponsible" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
          {t.privacy.confirmResponsible}
        </label>
        <SubmitButton className="btn w-full">{t.privacy.acceptButton}</SubmitButton>
      </form>
      <NotYou label={t.password.notYou} />
    </>
  );
}
