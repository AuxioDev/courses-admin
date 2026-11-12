"use client";

import { useEffect, useId, useRef, useState, type ChangeEventHandler, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { capsLockOn, PASSWORD_MAX } from "@/lib/form-kit";

export type PasswordFieldLabels = { show: string; hide: string; capsLock: string };

type Props = {
  name: string;
  label: string;
  labels: PasswordFieldLabels;
  autoComplete: "current-password" | "new-password";
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  minLength?: number;
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

// A password box with a show/hide button and a Caps Lock hint. What is shown is never kept: the password is hidden
// again when the form is sent, when focus leaves the field, and when the tab or window is hidden.
export function PasswordField({ name, label, labels, autoComplete, hint, error, required, minLength, value, defaultValue, onChange }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const hide = () => setVisible(false);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    const form = box.current?.closest("form");
    form?.addEventListener("submit", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      form?.removeEventListener("submit", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [visible]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (box.current?.contains(event.relatedTarget as Node | null)) return;
    setVisible(false);
    setCaps(false);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => setCaps(capsLockOn(event.nativeEvent));

  const capsId = `${id}-caps`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [caps ? capsId : null, hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div ref={box} className="relative" onBlur={onBlur}>
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          minLength={minLength}
          maxLength={PASSWORD_MAX}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onKeyDown={onKey}
          onKeyUp={onKey}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="field pr-12"
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-label={visible ? labels.hide : labels.show}
          // Pressing the button must not take focus (and the caret) away from the password box.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:text-ink active:text-accent"
        >
          <EyeIcon off={visible} />
        </button>
      </div>
      {/* The live region stays in the page so the hint is announced when it appears. */}
      <p id={capsId} role="status" className="mt-1 text-xs text-warn empty:hidden">
        {caps ? labels.capsLock : null}
      </p>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
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
