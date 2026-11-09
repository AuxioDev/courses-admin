import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { LoginForm } from "./login-form";
import { LanguageMenu } from "@/components/language-menu";
import { BookIcon } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.login.title };
}

// Desktop: form on the left, photo on the right. Below lg the same photo fills the
// screen behind the form, tinted so the card stands out.
export default async function LoginPage() {
  const { locale, t } = await getI18n();
  return (
    <main className="relative grid min-h-dvh lg:grid-cols-2">
      <div className="absolute right-4 top-4 z-20">
        <LanguageMenu locale={locale} label={t.profile.language} />
      </div>
      <div className="absolute inset-0 lg:relative lg:col-start-2 lg:row-start-1">
        <Image src="/login-photo.jpg" alt="" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-[50%_30%]" />
        <div className="absolute inset-0 bg-[#23333f]/45 lg:hidden" />
      </div>
      <div className="relative z-10 flex items-center justify-center px-4 pb-8 pt-20 lg:col-start-1 lg:row-start-1 lg:px-6 lg:py-8">
        <div className="flex w-full max-w-sm flex-col rounded-2xl bg-surface p-6 shadow-xl lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="mb-8">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-ink">
              <BookIcon width={26} height={26} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{t.meta.appName}</h1>
            <p className="mt-1 text-sm text-muted">{t.login.subtitle}</p>
          </div>
          <LoginForm labels={t.login} errors={t.errors} />
          <Link href={localePath(locale, "/forgot-password")} className="mt-4 text-center text-sm text-accent">
            {t.forgot.link}
          </Link>
          <Link href={localePath(locale, "/privacy")} className="mt-6 text-center text-xs text-muted">
            {t.privacy.link}
          </Link>
        </div>
      </div>
    </main>
  );
}
