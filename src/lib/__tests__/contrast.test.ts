// Keeps the colour palette accessible. Reads the real stylesheets, so editing a colour
// in globals.css (or an app's role-theme.css) that breaks WCAG AA fails this test.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string) => {
  const url = new URL(rel, import.meta.url);
  return existsSync(fileURLToPath(url)) ? readFileSync(fileURLToPath(url), "utf8") : "";
};

function split(css: string) {
  const i = css.indexOf("prefers-color-scheme: dark");
  const vars = (s: string) =>
    Object.fromEntries([...s.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));
  return { light: vars(i < 0 ? css : css.slice(0, i)), dark: i < 0 ? {} : vars(css.slice(i)) };
}

// Order matches the cascade: globals light, globals dark, role light, role dark.
const globals = split(read("../../app/globals.css"));
const roleCss = read("../../app/role-theme.css");
const role = split(roleCss);

// Colours an app re-scopes for one part of the page, e.g. the Admin Panel's indigo side navigation:
// `aside { --ink: ...; }`, with a second `aside` block inside the dark media query.
const asideVars = (css: string) =>
  [...css.matchAll(/(?:^|\n)[ \t]*aside[ \t]*\{([^}]*)\}/g)].map((m) =>
    Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((v) => [v[1], v[2].toLowerCase()])),
  );
const asides = asideVars(roleCss);
const modes = {
  light: { ...globals.light, ...role.light },
  dark: { ...globals.light, ...globals.dark, ...role.light, ...role.dark },
};

const channel = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(["light", "dark"] as const)("palette contrast (%s)", (mode) => {
  const c = modes[mode];

  it("defines every token as a hex colour", () => {
    for (const name of ["bg", "surface", "surface-2", "ink", "muted", "line", "accent", "accent-ink", "accent-soft", "good", "good-soft", "warn", "warn-soft", "bad", "bad-soft"]) {
      expect(c[name], `--${name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each([
    ["ink", "bg"], ["ink", "surface"], ["ink", "surface-2"],
    ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"],
    ["accent", "bg"], ["accent", "surface"], ["accent", "surface-2"], ["accent", "accent-soft"],
    ["accent-ink", "accent"],
    ["good", "good-soft"], ["warn", "warn-soft"], ["bad", "bad-soft"],
    ["good", "bg"], ["warn", "bg"], ["bad", "bg"],
  ])("text --%s on --%s is at least 4.5:1", (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it("accent stays visible as a border or focus ring (3:1) against the page", () => {
    expect(contrast(c.accent, c.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(c.accent, c.surface)).toBeGreaterThanOrEqual(3);
  });

  it("the divider line is distinguishable from the page", () => {
    expect(contrast(c.line, c.bg)).toBeGreaterThanOrEqual(1.2);
  });

  it("status colours are different from the accent role colour only where intended", () => {
    expect(c.good).not.toBe(c.bad);
    expect(c.warn).not.toBe(c.bad);
  });
});

describe.each(["light", "dark"] as const)("re-scoped side navigation (%s)", (mode) => {
  const scoped = asides.length === 0 ? null : { ...modes[mode], ...asides[0], ...(mode === "dark" ? (asides[1] ?? {}) : {}) };

  it.skipIf(!scoped).each([
    ["ink", "surface-2"], ["muted", "surface-2"], ["accent", "surface-2"],
    ["ink", "surface"], ["muted", "surface"], ["accent", "surface"],
  ])("text --%s on --%s is at least 4.5:1", (fg, bg) => {
    expect(contrast(scoped![fg], scoped![bg])).toBeGreaterThanOrEqual(4.5);
  });
});
