// The notification contract shared by all three apps. Payloads hold data, not
// text, so each student reads them in their own language.
import type { MarkType, NotificationType } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { dayKey, formatDateTime, formatDayKey } from "../dates";

export type NotificationPayloads = {
  new_homework: { homeworkId: string; homeworkTitle: string; course: string; dueAt: string };
  deadline: { homeworkId: string; homeworkTitle: string; course: string; dueAt: string };
  new_mark: { course: string; markType: MarkType; value: number };
  // date / newDate are day keys ("YYYY-MM-DD") in the school's timezone.
  lesson_changed: { course: string; change: "moved" | "cancelled" | "other"; date: string; newStartsAt?: string };
  homework_returned: { homeworkId: string; homeworkTitle: string; course: string };
};

// Which types are emailed when the student hasn't chosen otherwise.
export const EMAIL_DEFAULTS: Record<NotificationType, boolean> = {
  deadline: true,
  homework_returned: true,
  lesson_changed: true,
  new_homework: false,
  new_mark: false,
};

// Push is only sent to devices where the student turned it on, so every type
// is on by default there.
export const PUSH_DEFAULTS: Record<NotificationType, boolean> = {
  deadline: true,
  homework_returned: true,
  lesson_changed: true,
  new_homework: true,
  new_mark: true,
};

export const NOTIFICATION_TYPES = Object.keys(EMAIL_DEFAULTS) as NotificationType[];

export type RenderedNotification = { title: string; body: string; path: string | null };

// Notifications created before payloads became structured carried ready-made text.
type LegacyPayload = { title?: string; body?: string; homeworkId?: string; date?: string };

export function renderNotification(
  type: NotificationType,
  payload: unknown,
  t: Dictionary,
  locale: Locale,
  timeZone: string,
): RenderedNotification {
  const r = t.notifications.render;
  const p = (payload ?? {}) as Record<string, unknown>;
  const day = (key: unknown) => (typeof key === "string" ? formatDayKey(key, locale, { weekday: undefined, month: "long" }) : "");
  const when = (iso: unknown) => (typeof iso === "string" ? formatDateTime(new Date(iso), timeZone, locale) : "");

  if (typeof p.title === "string" && !("course" in p)) {
    const legacy = p as LegacyPayload;
    return {
      title: legacy.title ?? t.notifications.type[type],
      body: legacy.body ?? "",
      path: legacy.homeworkId ? `/homework/${legacy.homeworkId}` : legacy.date ? `/diary?date=${legacy.date}` : null,
    };
  }

  switch (type) {
    case "new_homework":
    case "deadline": {
      const d = p as NotificationPayloads["deadline"];
      return {
        title: fmt(r[type].title, { title: d.homeworkTitle }),
        body: fmt(r[type].body, { course: d.course, due: when(d.dueAt) }),
        path: `/homework/${d.homeworkId}`,
      };
    }
    case "new_mark": {
      const d = p as NotificationPayloads["new_mark"];
      return {
        title: fmt(r.new_mark.title, { course: d.course }),
        body: fmt(r.new_mark.body, { type: t.marks.type[d.markType] ?? d.markType, value: d.value }),
        path: "/marks",
      };
    }
    case "lesson_changed": {
      const d = p as NotificationPayloads["lesson_changed"];
      const kind = d.change === "moved" ? r.lesson_moved : d.change === "cancelled" ? r.lesson_cancelled : r.lesson_changed;
      return {
        title: fmt(kind.title, { course: d.course }),
        body: fmt(kind.body, { date: day(d.date), newDate: when(d.newStartsAt) }),
        // A moved lesson is found on its new day, not the one it left.
        path: `/diary?date=${d.newStartsAt ? dayKey(new Date(d.newStartsAt), timeZone) : d.date}`,
      };
    }
    case "homework_returned": {
      const d = p as NotificationPayloads["homework_returned"];
      return {
        title: fmt(r.homework_returned.title, { title: d.homeworkTitle }),
        body: fmt(r.homework_returned.body, { course: d.course }),
        path: `/homework/${d.homeworkId}`,
      };
    }
  }
}

export function notificationHref(locale: Locale, rendered: RenderedNotification) {
  return rendered.path ? localePath(locale, rendered.path) : null;
}
