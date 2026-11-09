"use client";

import { useParams } from "next/navigation";

// Kept here rather than in the dictionaries so this page works even when loading them failed.
const TEXT = {
  az: { title: "Xəta baş verdi", body: "Səhifə açılmadı. Yenidən cəhd edin.", retry: "Yenidən cəhd et", code: "Kod" },
  en: { title: "Something went wrong", body: "This page couldn't load. Try again.", retry: "Try again", code: "Code" },
  ru: {
    title: "Произошла ошибка",
    body: "Страница не открылась. Попробуйте ещё раз.",
    retry: "Попробовать снова",
    code: "Код",
  },
} as const;

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { lang } = useParams<{ lang: keyof typeof TEXT }>();
  const t = TEXT[lang] ?? TEXT.az;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.body}</p>
      <button type="button" onClick={() => retry()} className="btn mt-6">
        {t.retry}
      </button>
      {error.digest && (
        <p className="mt-4 text-xs text-muted">
          {t.code}: {error.digest}
        </p>
      )}
    </main>
  );
}
