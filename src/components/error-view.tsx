"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { localePath, type Locale } from "@/i18n/config";

// Here rather than in the dictionaries so the page still works when loading them is what failed.
const TEXT = {
  az: {
    title: "Səhifə yüklənmədi",
    body: "İnterneti yoxlayın və yenidən cəhd edin. Təkrarlanarsa, aşağıdakı xəta kodunu bildirin.",
    retry: "Yenidən cəhd et",
    home: "Əsas səhifəyə",
    code: "Xəta kodu",
  },
  en: {
    title: "This page didn't load",
    body: "Check your connection, then try again. If it keeps happening, report the error code below.",
    retry: "Try again",
    home: "Back to start",
    code: "Error code",
  },
  ru: {
    title: "Страница не загрузилась",
    body: "Проверьте соединение и попробуйте ещё раз. Если повторяется, сообщите код ошибки ниже.",
    retry: "Попробовать снова",
    home: "На главную",
    code: "Код ошибки",
  },
} as const;

// `fullScreen` is for the boundary above the app's layout (nothing else is on screen); inside the layout the
// navigation stays visible, so the person can simply go somewhere else.
export function ErrorView({
  error,
  retry,
  fullScreen = false,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  fullScreen?: boolean;
}) {
  const { lang } = useParams<{ lang: Locale }>();
  const t = TEXT[lang] ?? TEXT.az;
  return (
    <div
      role="alert"
      className={`mx-auto flex max-w-sm flex-col items-center justify-center px-6 text-center ${fullScreen ? "min-h-dvh" : "py-16"}`}
    >
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-warn-soft text-warn" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 8v5" />
          <path d="M12 16.5h.01" />
          <circle cx="12" cy="12" r="9.25" />
        </svg>
      </span>
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn">
          {t.retry}
        </button>
        <Link href={localePath(TEXT[lang] ? lang : "az", "/")} className="btn-ghost">
          {t.home}
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted">
          {t.code}: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
