import { describe, expect, it } from "vitest";
import { az } from "../dictionaries/az";
import { en } from "../dictionaries/en";
import { ru } from "../dictionaries/ru";

type Leaf = string | { one: string; few?: string; many?: string; other: string };

function isPlural(v: unknown): v is Extract<Leaf, object> {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).one === "string" && typeof (v as Record<string, unknown>).other === "string";
}

function flatten(node: unknown, prefix = "", out = new Map<string, string>()) {
  if (typeof node === "string") out.set(prefix, node);
  else if (isPlural(node)) out.set(prefix, Object.values(node).join(" | "));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(",");
const langs = { en: flatten(en), az: flatten(az), ru: flatten(ru) };

describe("dictionaries", () => {
  it("have the same keys in en, az and ru", () => {
    const keys = [...langs.en.keys()].sort();
    for (const [name, map] of Object.entries(langs)) {
      expect([...map.keys()].sort(), name).toEqual(keys);
    }
  });

  it("have no empty strings", () => {
    for (const [name, map] of Object.entries(langs)) {
      const empty = [...map].filter(([, v]) => v.replace(/[|\s]/g, "") === "").map(([k]) => k);
      expect(empty, `${name} has empty values`).toEqual([]);
    }
  });

  it("use the same {placeholders} in every language", () => {
    const bad: string[] = [];
    for (const [key, enValue] of langs.en) {
      for (const lang of ["az", "ru"] as const) {
        if (placeholders(langs[lang].get(key) ?? "") !== placeholders(enValue)) bad.push(`${lang}:${key}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("flags untranslated copies (same as English) for review, without failing", () => {
    // Informational: short brand/technical words legitimately match, so this only guards against a mass copy-paste.
    for (const lang of ["az", "ru"] as const) {
      const same = [...langs.en].filter(([k, v]) => v.length > 25 && langs[lang].get(k) === v);
      expect(same.length, `${lang} copies of English: ${same.map(([k]) => k).join(", ")}`).toBeLessThan(5);
    }
  });
});
