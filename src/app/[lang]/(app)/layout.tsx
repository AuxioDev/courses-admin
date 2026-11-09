import Link from "next/link";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { AppNav } from "@/components/app-nav";
import { LanguageMenu } from "@/components/language-menu";

// Tablets and desktops get the side navigation; phones get a bar at the bottom.
export default async function AppLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getI18n();
  return (
    <div className="min-h-dvh pb-24 md:pb-10 md:pl-56 print:p-0">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:justify-end">
          <Link href={localePath(locale, "/")} className="text-[15px] font-semibold tracking-tight md:hidden">
            {t.meta.appName}
          </Link>
          <LanguageMenu locale={locale} label={t.profile.language} saveToAccount />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 md:pt-8">{children}</main>
      <AppNav locale={locale} labels={{ ...t.nav, appName: t.meta.appName }} />
    </div>
  );
}
