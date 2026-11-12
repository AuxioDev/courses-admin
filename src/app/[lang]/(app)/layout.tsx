import { Suspense } from "react";
import Link from "next/link";
import { fmt, getI18n } from "@/i18n";
import { getNewApplicationCount } from "@/lib/data";
import { localePath } from "@/i18n/config";
import { AppNav } from "@/components/app-nav";
import { LanguageMenu } from "@/components/language-menu";
import { ConfirmLabelsProvider } from "@/components/confirm-dialog";
import { PageTransition } from "@/components/page-transition";

// How many applications from the website nobody has answered yet. Nothing is shown at zero.
async function NewApplications({ label }: { label: string }) {
  const count = await getNewApplicationCount();
  if (count === 0) return null;
  return (
    <span className="arrive inline-flex min-w-5 items-center justify-center rounded-full bg-warn-soft px-1.5 text-[0.6875rem] font-bold text-warn">
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{fmt(label, { n: count })}</span>
    </span>
  );
}

// Tablets and desktops get the side navigation; phones get a bar at the bottom.
export default async function AppLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getI18n();
  return (
    <div className="min-h-dvh pb-24 md:pb-10 md:pl-56 print:p-0">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:justify-end">
          <Link href={localePath(locale, "/")} className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold tracking-tight md:hidden">
            {t.meta.appName}
          </Link>
          <LanguageMenu locale={locale} label={t.profile.language} saveToAccount />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 md:pt-8">
        <PageTransition>
          <ConfirmLabelsProvider labels={t.dialog}>{children}</ConfirmLabelsProvider>
        </PageTransition>
      </main>
      <AppNav
        locale={locale}
        labels={{ ...t.nav, appName: t.meta.appName }}
        applicationsBadge={
          <Suspense fallback={null}>
            <NewApplications label={t.applications.newCount} />
          </Suspense>
        }
      />
    </div>
  );
}
