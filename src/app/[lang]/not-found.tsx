import Link from "next/link";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";

export default async function NotFound() {
  const { locale, t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">{t.notFound.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.notFound.body}</p>
      <Link href={localePath(locale, "/")} className="btn mt-6">
        {t.notFound.back}
      </Link>
    </main>
  );
}
