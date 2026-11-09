import { intlLocale, type Locale } from "./config";
import type { PluralForms } from "./dictionaries/en";

// Safe for client components too.

export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

export function plural(locale: Locale, forms: PluralForms, n: number) {
  const category = new Intl.PluralRules(intlLocale[locale]).select(n) as keyof PluralForms;
  return fmt(forms[category] ?? forms.other, { n });
}
