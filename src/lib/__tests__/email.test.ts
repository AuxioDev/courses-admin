import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({ dirs: [] as string[], files: [] as { file: string; content: string }[] }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async (dir: string) => void fs.dirs.push(dir)),
  writeFile: vi.fn(async (file: string, content: string) => void fs.files.push({ file, content })),
}));

import { emailLayout, sendEmail } from "../email";

const mail = { to: "student@school.az", subject: "Hello", html: "<p>hi</p>", text: "hi" };
const fetchMock = vi.fn();

beforeEach(() => {
  fs.dirs.length = 0;
  fs.files.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("emailLayout", () => {
  const opts = { lang: "en", greeting: "Hi Aysel,", title: "Deadline", body: "Due tomorrow", buttonLabel: "Open", buttonUrl: "https://app.example/x", footer: "You get this because…" };

  it("builds a page with every part, and a plain-text copy with the link spelled out", () => {
    const { html, text } = emailLayout(opts);
    for (const part of ["Hi Aysel,", "Deadline", "Due tomorrow", "Open", "You get this because…"]) expect(html).toContain(part);
    expect(html).toContain('lang="en"');
    expect(html).toContain('href="https://app.example/x"');
    expect(text).toContain("Open: https://app.example/x");
  });

  it("cannot be used to inject markup through a name, a title or a link", () => {
    const evil = { ...opts, greeting: '<img src=x onerror="alert(1)">', title: "<script>steal()</script>", body: "a & b < c", buttonUrl: 'https://x.example/"><script>alert(1)</script>', lang: 'en"><script>' };
    const { html } = emailLayout(evil);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/href="[^"]*"[^>]*><script/);
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
    expect(html).toContain("a &amp; b &lt; c");
    // Quotes are escaped, so a value can never close its attribute early.
    expect(html).toContain("&quot;");
  });
});

describe("sendEmail", () => {
  it("sends through Resend when a key is set, with the sender from the environment", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("EMAIL_FROM", "School <hello@school.az>");
    fetchMock.mockResolvedValue({ ok: true });
    expect(await sendEmail(mail)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body)).toEqual({ from: "School <hello@school.az>", to: ["student@school.az"], subject: "Hello", html: "<p>hi</p>", text: "hi" });
  });

  it("does not send to the reserved demo domain: it only bounces and harms the sender's reputation", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    expect(await sendEmail({ ...mail, to: "Demo@EXAMPLE.com" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failure, and logs only the status because the provider's text can echo the recipient's address", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => `invalid address ${mail.to}` });
    expect(await sendEmail(mail)).toBe(false);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("422");
    expect(logged).not.toContain(mail.to);
  });

  it("writes the email to a file in development, with a name that cannot escape the folder", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("VERCEL", "");
    expect(await sendEmail({ ...mail, to: "../../evil/x@school.az" })).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.dirs[0]).toMatch(/\.emails$/);
    const { file, content } = fs.files[0];
    // The address's slashes became underscores: the file is one name directly inside the folder.
    expect(path.dirname(file)).toBe(fs.dirs[0]);
    expect(path.basename(file)).not.toMatch(/[\\/]/);
    expect(content).toContain("Subject: Hello");
    expect(content).toContain("<p>hi</p>");
  });

  it("does not pretend to send on Vercel when no key is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("VERCEL", "1");
    expect(await sendEmail(mail)).toBe(false);
    expect(fs.files).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
