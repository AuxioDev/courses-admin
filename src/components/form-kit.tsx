"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { copyText, counterState } from "@/lib/form-kit";
import { fmt } from "@/i18n/format";

// A labelled field whose error and hint are tied to the control, so a screen reader reads them with it.
//   <Field label="Email" error={errors.email}>{(a11y) => <input name="email" className="field" {...a11y} />}</Field>
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (a11y: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

// The one box for "it worked" and "it didn't". The roles and colour classes are what motion.css animates (tick, nudge),
// so every form confirms the same way. Clear the success message when the person edits again.
export function FormMessage({ kind, children }: { kind: "success" | "error"; children: ReactNode }) {
  return kind === "error" ? (
    <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
      {children}
    </p>
  ) : (
    <p role="status" className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">
      {children}
    </p>
  );
}

// Shows how many characters are left once the limit is near; always takes the same room, so nothing jumps.
export function CharCounter({ length, max, labels }: { length: number; max: number; labels: { charsLeft: string; charsOver: string } }) {
  const state = counterState(length, max);
  return (
    <span aria-live={state.over ? "polite" : "off"} className={`block h-4 text-right text-xs ${state.over ? "text-bad" : "text-muted"}`}>
      {state.show ? fmt(state.over ? labels.charsOver : labels.charsLeft, { n: Math.abs(state.left) }) : ""}
    </span>
  );
}

// Copies text and says so (announced politely). If the browser refuses, it says that instead of failing silently.
export function CopyButton({
  text,
  labels,
  className = "btn-ghost",
  onCopied,
}: {
  text: string;
  labels: { copy: string; copied: string; failed: string };
  className?: string;
  onCopied?: () => void;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    if (ok) onCopied?.();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <>
      <button type="button" onClick={copy} className={className}>
        {state === "copied" ? labels.copied : labels.copy}
      </button>
      <span role="status" className={state === "failed" ? "text-xs text-bad" : "sr-only"}>
        {state === "copied" ? labels.copied : state === "failed" ? labels.failed : ""}
      </span>
    </>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full origin-left rounded-full bg-accent transition-transform" style={{ transform: `scaleX(${percent / 100})` }} />
    </div>
  );
}
