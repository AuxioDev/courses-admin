import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Sends through Resend when RESEND_API_KEY is set. Otherwise (development) each
// email is written to ./.emails as an HTML file and logged.

export type Email = { to: string; subject: string; html: string; text: string };

export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function sendEmail(email: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  // Demo accounts use the reserved example.com domain. Sending there only bounces,
  // which harms the sender's reputation.
  if (key && email.to.toLowerCase().endsWith("@example.com")) return false;
  if (!key) {
    if (process.env.VERCEL) {
      console.warn(`[email] RESEND_API_KEY is not set; not sending "${email.subject}"`);
      return false;
    }
    const dir = path.join(process.cwd(), ".emails");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${email.to.replace(/[^a-z0-9@._-]/gi, "_")}.html`);
    await writeFile(file, `<!-- To: ${email.to} | Subject: ${email.subject} -->\n${email.html}`);
    console.log(`[email] (dev) to ${email.to}: "${email.subject}" → ${path.relative(process.cwd(), file)}`);
    return true;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Student Diary <onboarding@resend.dev>",
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    // Only the status: Resend's error text can echo the recipient's address.
    console.error(`[email] Resend failed (${res.status})`);
    return false;
  }
  return true;
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// One plain, mobile-friendly layout for every email.
export function emailLayout(opts: {
  lang: string;
  greeting: string;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  footer: string;
}) {
  const e = { ...opts, ...Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, escape(v)])) };
  const html = `<!doctype html>
<html lang="${e.lang}"><body style="margin:0;background:#eef3f7;font-family:Arial,Helvetica,sans-serif;color:#23333f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #d5dfe7;border-radius:16px" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px">
<p style="margin:0 0 16px;font-size:14px;color:#566a7a">${e.greeting}</p>
<h1 style="margin:0 0 8px;font-size:20px;line-height:1.3">${e.title}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${e.body}</p>
<a href="${e.buttonUrl}" style="display:inline-block;background:#16794c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:12px;font-size:14px">${e.buttonLabel}</a>
</td></tr></table>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#566a7a">${e.footer}</p>
</td></tr></table></body></html>`;
  const text = `${opts.greeting}\n\n${opts.title}\n${opts.body}\n\n${opts.buttonLabel}: ${opts.buttonUrl}\n\n${opts.footer}`;
  return { html, text };
}
