// Safe to import from proxy, server and client code.

export const locales = ["az", "en", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "az";
export const LOCALE_COOKIE = "cs_locale";

// BCP 47 tags passed to Intl formatters.
export const intlLocale: Record<Locale, string> = { az: "az", en: "en-GB", ru: "ru" };

export function hasLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

// First supported language in an Accept-Language header, ignoring region (ru-RU -> ru).
export function matchLocale(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return ranked.find((r) => hasLocale(r.lang))?.lang as Locale | null ?? null;
}

// A path inside this site, safe to redirect to. Rejects //host and backslash tricks.
export function isInternalPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 500 && /^\/(?!\/)/.test(path) && !path.includes("\\");
}

export function localePath(locale: Locale, path: string) {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
