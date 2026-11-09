import type { Metadata } from "next";
import { getSettings } from "@/lib/data";
import { getI18n } from "@/i18n";
import { Card, PageTitle } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.settings };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function SettingsPage() {
  return <Settings />;
}

async function Settings() {
  const [{ t }, values] = await Promise.all([getI18n(), getSettings()]);
  return (
    <div className="max-w-2xl">
      <PageTitle title={t.nav.settings} />
      <Card className="mb-4">
        <SettingsForm values={values} markTypes={t.marks.type} labels={t.settings} errors={t.errors} ok={t.ok} />
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">{t.settings.scaleTitle}</h2>
        <p className="mt-0.5 font-mono text-lg font-bold">0–100</p>
        <p className="mt-0.5 text-xs text-muted">{t.settings.scaleHint}</p>
      </Card>
    </div>
  );
}
