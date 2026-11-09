"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localePath, type Locale } from "@/i18n/config";
import { updateLocale } from "@/app/actions";
import { ChevronRight } from "./icons";

const ORDER: Locale[] = ["az", "ru", "en"];

type Props = {
  locale: Locale;
  label: string;
  // Signed-in students: the choice is saved on their account.
  saveToAccount?: boolean;
};

function Menu({ locale, label, saveToAccount, path }: Props & { path: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex h-11 w-full items-center justify-center text-sm font-semibold";
  const tone = (l: Locale) => (l === locale ? "bg-surface-2 text-accent" : "text-ink active:bg-surface-2");

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label}: ${locale.toUpperCase()}`}
        className="inline-flex h-11 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink"
      >
        {locale.toUpperCase()}
        <ChevronRight width={14} height={14} className={`transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <ul className="absolute right-0 top-full z-30 mt-1 w-20 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          {ORDER.map((l) => (
            <li key={l}>
              {saveToAccount ? (
                <form action={updateLocale}>
                  <input type="hidden" name="locale" value={l} />
                  <input type="hidden" name="path" value={path} />
                  <button type="submit" lang={l} aria-current={l === locale ? "true" : undefined} className={`${item} ${tone(l)}`}>
                    {l.toUpperCase()}
                  </button>
                </form>
              ) : (
                <Link
                  href={localePath(l, path)}
                  hrefLang={l}
                  aria-current={l === locale ? "true" : undefined}
                  className={`${item} ${tone(l)}`}
                >
                  {l.toUpperCase()}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CurrentPathMenu(props: Props) {
  // Strip the /az, /ru or /en prefix: the same page opens in the chosen language.
  const path = usePathname().replace(/^\/[^/]+/, "") || "/";
  return <Menu {...props} path={path} />;
}

export function LanguageMenu(props: Props) {
  return (
    <Suspense fallback={<Menu {...props} path="/" />}>
      <CurrentPathMenu {...props} />
    </Suspense>
  );
}
