import { describe, expect, it } from "vitest";
import { az } from "@/i18n/dictionaries/az";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";
import { locales, type Locale } from "@/i18n/config";
import { EMAIL_DEFAULTS, NOTIFICATION_TYPES, notificationHref, PUSH_DEFAULTS, renderNotification, type NotificationPayloads } from "../types";

const dictionaries = { az, en, ru };
const BAKU = "Asia/Baku";

const samples: { [K in keyof NotificationPayloads]: NotificationPayloads[K] } = {
  new_homework: { homeworkId: "h1", homeworkTitle: "Essay", course: "Math", dueAt: "2026-11-20T10:00:00.000Z" },
  deadline: { homeworkId: "h1", homeworkTitle: "Essay", course: "Math", dueAt: "2026-11-20T10:00:00.000Z" },
  new_mark: { course: "Math", markType: "quiz", value: 87.5 },
  lesson_changed: { course: "Math", change: "moved", date: "2026-11-12", newStartsAt: "2026-11-14T08:00:00.000Z" },
  homework_returned: { homeworkId: "h1", homeworkTitle: "Essay", course: "Math" },
};

const render = (type: keyof NotificationPayloads, locale: Locale, payload: unknown = samples[type]) =>
  renderNotification(type, payload, dictionaries[locale], locale, BAKU);

describe("renderNotification", () => {
  it.each(NOTIFICATION_TYPES.flatMap((type) => locales.map((locale) => [type, locale] as const)))(
    "%s in %s is a finished sentence: a title, a body, no placeholder left over",
    (type, locale) => {
      const r = render(type, locale);
      for (const text of [r.title, r.body]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/\{\w+\}/);
        expect(text).not.toMatch(/undefined|NaN|\[object/);
      }
    },
  );

  it("puts the homework's name and the course in the text, and links to that homework", () => {
    for (const type of ["new_homework", "deadline", "homework_returned"] as const) {
      const r = render(type, "en");
      expect(r.title + r.body).toContain("Essay");
      expect(r.path).toBe("/homework/h1");
    }
    expect(render("deadline", "en").body).toContain("Math");
  });

  it("shows the mark the teacher gave and links to the marks", () => {
    const r = render("new_mark", "en");
    expect(r.body).toContain("87.5");
    expect(r.path).toBe("/marks");
  });

  it("tells a moved lesson from a cancelled one, and finds a moved lesson on its new day", () => {
    const moved = render("lesson_changed", "en");
    const cancelled = render("lesson_changed", "en", { course: "Math", change: "cancelled", date: "2026-11-12" });
    const other = render("lesson_changed", "en", { course: "Math", change: "other", date: "2026-11-12" });
    expect(new Set([moved.title, cancelled.title, other.title]).size).toBe(3);
    // 08:00Z on the 14th is 12:00 in Baku: the same day.
    expect(moved.path).toBe("/diary?date=2026-11-14");
    expect(cancelled.path).toBe("/diary?date=2026-11-12");
    // 22:00Z is already tomorrow in Baku (UTC+4): the link follows the school's day, not UTC's.
    expect(render("lesson_changed", "en", { course: "Math", change: "moved", date: "2026-11-12", newStartsAt: "2026-11-14T22:00:00.000Z" }).path).toBe("/diary?date=2026-11-15");
  });

  it("speaks the student's language", () => {
    expect(render("deadline", "ru").title).toMatch(/[А-Яа-я]/);
    expect(render("deadline", "az").title).not.toBe(render("deadline", "en").title);
  });

  it("still shows notifications saved before payloads were structured, and links them where it can", () => {
    expect(renderNotification("new_homework", { title: "Old title", body: "Old body", homeworkId: "h9" }, en, "en", BAKU)).toEqual({ title: "Old title", body: "Old body", path: "/homework/h9" });
    expect(renderNotification("lesson_changed", { title: "T", body: "B", date: "2026-01-02" }, en, "en", BAKU).path).toBe("/diary?date=2026-01-02");
    expect(renderNotification("new_mark", { title: "T" }, en, "en", BAKU)).toMatchObject({ title: "T", body: "", path: null });
  });

  it("survives a payload with nothing in it", () => {
    for (const type of NOTIFICATION_TYPES) expect(() => render(type, "en", null)).not.toThrow();
  });
});

describe("delivery defaults", () => {
  it("emails only what a student would be upset to miss, and pushes everything to devices that opted in", () => {
    expect(EMAIL_DEFAULTS).toEqual({ deadline: true, homework_returned: true, lesson_changed: true, new_homework: false, new_mark: false });
    expect(Object.values(PUSH_DEFAULTS).every(Boolean)).toBe(true);
    expect(Object.keys(EMAIL_DEFAULTS).sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });
});

describe("notificationHref", () => {
  it("adds the language, or says there is nowhere to go", () => {
    expect(notificationHref("ru", { title: "t", body: "b", path: "/marks" })).toBe("/ru/marks");
    expect(notificationHref("en", { title: "t", body: "b", path: null })).toBeNull();
  });
});
