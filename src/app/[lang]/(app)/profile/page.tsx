import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Card, PageTitle } from "@/components/ui";
import { logout, logoutEverywhere } from "@/app/actions";
import { PasswordForm } from "@/components/password-form";
import { TimezoneForm } from "./timezone-form";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.profile.title };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function ProfilePage() {
  return <Profile />;
}

async function Profile() {
  const [{ locale, t }, admin] = await Promise.all([getI18n(), getCurrentAdmin()]);
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageTitle title={t.profile.title} />
      <div className="max-w-3xl gap-4 lg:columns-2 [&>*]:break-inside-avoid">
        <Card className="mb-4">
          <p className="text-lg font-semibold">{admin.name}</p>
          <p className="text-sm text-muted">{admin.email}</p>
        </Card>
        <Card className="mb-4">
          <TimezoneForm
            current={admin.timezone}
            timezones={timezones}
            labels={{ timezone: t.profile.timezone, save: t.common.save, saving: t.common.saving }}
            errors={t.errors}
            ok={t.ok}
          />
        </Card>
        <Card className="mb-4">
          <h2 className="mb-3 text-sm font-semibold">{t.password.changeTitle}</h2>
          <PasswordForm mode="change" labels={t.password} errors={t.errors} ok={t.ok} />
        </Card>
        <Card className="mb-4">
          <h2 className="text-sm font-semibold">{t.profile.security}</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted">{t.profile.logoutEverywhereHint}</p>
          <form action={logoutEverywhere}>
            <SubmitButton className="btn-ghost">{t.profile.logoutEverywhere}</SubmitButton>
          </form>
          <Link href={localePath(locale, "/privacy")} className="mt-3 block text-sm text-accent">
            {t.privacy.link}
          </Link>
        </Card>
        <form action={logout}>
          <SubmitButton className="btn-ghost w-full text-bad">{t.profile.logout}</SubmitButton>
        </form>
      </div>
    </>
  );
}
