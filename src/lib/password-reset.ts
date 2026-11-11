import "server-only";
import { randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { db } from "./db";
import { APP_URL, emailLayout, sendEmail } from "./email";
import { hashToken } from "./passwords";
import { getDictionary } from "@/i18n";
import { defaultLocale, hasLocale, localePath, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";

const TTL_MS = 60 * 60 * 1000;
const MAX_LINKS_PER_HOUR = 3;

type Recipient = { id: string; name: string; email: string; role: Role; locale: string | null };

// Null after 3 links in an hour.
async function createResetToken(userId: string) {
  const recent = await db.authToken.count({
    where: { userId, type: "reset", createdAt: { gte: new Date(Date.now() - TTL_MS) } },
  });
  if (recent >= MAX_LINKS_PER_HOUR) return null;

  const token = randomBytes(32).toString("base64url");
  await db.authToken.create({
    data: { userId, type: "reset", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS) },
  });
  return token;
}

const recipientLocale = (user: Recipient): Locale => (hasLocale(user.locale) ? user.locale : defaultLocale);

// Emails a one-time reset link (valid 1 hour). Silently does nothing for unknown,
// inactive or non-admin accounts, or after 3 links in an hour, so the response
// never reveals whether an email is registered.
export async function sendResetLink(email: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || user.role !== "admin") return;

  const token = await createResetToken(user.id);
  if (!token) return;

  const locale = recipientLocale(user);
  const t = getDictionary(locale);
  const { html, text } = emailLayout({
    lang: locale,
    greeting: fmt(t.email.greeting, { name: user.name.split(" ")[0] }),
    title: t.email.resetSubject,
    body: t.email.resetBody,
    buttonLabel: t.email.resetButton,
    buttonUrl: `${APP_URL}${localePath(locale, "/reset-password")}?token=${token}`,
    footer: t.email.footer,
  });
  await sendEmail({ to: user.email, subject: t.email.resetSubject, html, text });
}

// Each app's reset page refuses other roles, so the link must open the person's own app.
export function appUrlFor(role: Role) {
  if (role === "admin") return APP_URL;
  const [name, fallback] =
    role === "student"
      ? (["STUDENT_APP_URL", "http://localhost:3000"] as const)
      : (["TEACHER_APP_URL", "http://localhost:3001"] as const);
  const url = process.env[name];
  if (!url && process.env.VERCEL) throw new Error(`${name} is required on Vercel`);
  return (url || fallback).replace(/\/$/, "");
}

// Sent when an admin presses the button, so unlike sendResetLink it reports what happened.
export async function emailResetLinkTo(user: Recipient): Promise<"sent" | "tooMany" | "notSent"> {
  const token = await createResetToken(user.id);
  if (!token) return "tooMany";

  const locale = recipientLocale(user);
  const t = getDictionary(locale);
  const { html, text } = emailLayout({
    lang: locale,
    greeting: fmt(t.email.greeting, { name: user.name.split(" ")[0] }),
    title: t.email.linkSubject,
    body: t.email.linkBody,
    buttonLabel: t.email.resetButton,
    buttonUrl: `${appUrlFor(user.role)}${localePath(locale, "/reset-password")}?token=${token}`,
    footer: t.email.linkFooter,
  });
  return (await sendEmail({ to: user.email, subject: t.email.linkSubject, html, text })) ? "sent" : "notSent";
}
