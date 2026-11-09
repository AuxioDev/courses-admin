import "server-only";
import { after } from "next/server";
import { db } from "../db";
import { formatDateTime, formatDayKey, type DayKey } from "../dates";
import { emailLayout, sendEmail } from "../email";
import { appUrlFor } from "../password-reset";
import { getDictionary } from "@/i18n";
import { defaultLocale, hasLocale, localePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";

// Teachers have no notification screen and NotificationType is student-only, so a
// schedule change reaches them by plain email. It also shows in My lessons.
export type TeacherNotice =
  | { kind: "moved"; course: string; group: string; at: Date; newAt: Date }
  | { kind: "cancelled" | "restored" | "assigned" | "unassigned" | "added"; course: string; group: string; at: Date }
  | { kind: "groupAssigned" | "groupUnassigned"; course: string; group: string }
  | { kind: "schedule"; course: string; group: string; day: DayKey };

async function emailOne(teacherId: string, notice: TeacherNotice) {
  const user = await db.user.findUnique({
    where: { id: teacherId },
    select: { name: true, email: true, locale: true, timezone: true, active: true },
  });
  if (!user?.active) return;
  const locale = hasLocale(user.locale) ? user.locale : defaultLocale;
  const t = getDictionary(locale);
  const texts = t.teacherEmail[notice.kind];
  const vars = {
    course: notice.course,
    group: notice.group,
    date: "at" in notice ? formatDateTime(notice.at, user.timezone, locale) : "day" in notice ? formatDayKey(notice.day, locale, { weekday: undefined }) : "",
    newDate: notice.kind === "moved" ? formatDateTime(notice.newAt, user.timezone, locale) : "",
  };
  const title = fmt(texts.title, vars);
  const { html, text } = emailLayout({
    lang: locale,
    greeting: fmt(t.email.greeting, { name: user.name.split(" ")[0] }),
    title,
    body: fmt(texts.body, vars),
    buttonLabel: t.teacherEmail.open,
    buttonUrl: `${appUrlFor("teacher")}${localePath(locale, "/lessons")}`,
    footer: t.email.linkFooter,
  });
  await sendEmail({ to: user.email, subject: title, html, text });
}

// Runs after the response, and one failure must not stop the rest.
export function emailTeachers(messages: { teacherId: string; notice: TeacherNotice }[]) {
  after(async () => {
    for (const { teacherId, notice } of messages) {
      try {
        await emailOne(teacherId, notice);
      } catch (e) {
        console.error(`[email] teacher notice failed: ${e instanceof Error ? e.name : "unknown"}`);
      }
    }
  });
}
