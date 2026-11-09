import "server-only";
import { cookies } from "next/headers";
import { lang } from "next/root-params";
import { az } from "./dictionaries/az";
import { en, type Dictionary } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";
import { defaultLocale, hasLocale, LOCALE_COOKIE, type Locale } from "./config";

export * from "./format";
export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { az, en, ru };

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}

// For Server Components: the language comes from the /[lang] URL segment.
export async function getI18n() {
  const value = await lang();
  const locale = hasLocale(value) ? value : defaultLocale;
  return { locale, t: dictionaries[locale] };
}

// For Server Actions, which can't read root params: proxy keeps this cookie in
// sync with the URL language on every request.
export async function getRequestLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return hasLocale(value) ? value : defaultLocale;
}
