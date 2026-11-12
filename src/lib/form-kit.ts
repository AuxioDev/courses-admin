// The small rules behind the shared form components, kept free of React so they can be tested directly.

// The server accepts 8 to 200 characters (lib/passwords.ts); the form says the same before sending.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export function passwordChecks(password: string, confirm: string) {
  return {
    started: password.length > 0,
    longEnough: password.length >= PASSWORD_MIN,
    tooLong: password.length > PASSWORD_MAX,
    confirmStarted: confirm.length > 0,
    matches: confirm.length > 0 && password === confirm,
  };
}

// Whether the Caps Lock light is on, as far as the browser will say (some keyboards and autofill events don't).
export function capsLockOn(event: { getModifierState?: (key: string) => boolean }) {
  try {
    return event.getModifierState?.("CapsLock") === true;
  } catch {
    return false;
  }
}

// A character counter that stays out of the way until the limit is near.
export function counterState(length: number, max: number) {
  const left = max - length;
  const showFrom = Math.max(10, Math.floor(max * 0.15));
  return { left, over: left < 0, show: left <= showFrom };
}

type CopyEnv = { writeText?: (text: string) => Promise<void>; legacy?: (text: string) => boolean };

// Copies text, and says whether it worked. Never throws: no secure page, a denied permission or an old browser all end in `false`.
export async function copyText(text: string, env: CopyEnv = browserCopyEnv()): Promise<boolean> {
  try {
    if (env.writeText) {
      await env.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the old way.
  }
  try {
    return env.legacy ? env.legacy(text) : false;
  } catch {
    return false;
  }
}

function browserCopyEnv(): CopyEnv {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  return { writeText: clipboard?.writeText ? (text) => clipboard.writeText(text) : undefined, legacy: legacyCopy };
}

function legacyCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  try {
    return document.execCommand("copy");
  } finally {
    area.remove();
  }
}

// Files dropped on a drop zone, narrowed to what the zone accepts (".pdf,image/*" style list, as in <input accept>).
export function acceptsFile(file: { name: string; type: string }, accept: string | undefined) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  return accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) =>
      rule.startsWith(".") ? name.endsWith(rule) : rule.endsWith("/*") ? file.type.startsWith(rule.slice(0, -1)) : file.type === rule,
    );
}
