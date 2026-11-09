"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { changePassword, resetPassword } from "@/app/actions";

type Props = {
  labels: Dictionary["password"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
} & (
  | { mode: "change" | "forced"; token?: never }
  | { mode: "reset"; token: string }
);

// "change": from Profile; "forced": after logging in with a temporary password;
// "reset": from a one-time link, so no current password is asked for.
export function PasswordForm({ mode, token, labels, errors, ok }: Props) {
  const [state, action, pending] = useActionState(mode === "reset" ? resetPassword : changePassword, undefined);
  return (
    <form action={action} className="space-y-3">
      {mode === "reset" ? (
        <input type="hidden" name="token" value={token} />
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{mode === "forced" ? labels.temporary : labels.current}</span>
          <input name="currentPassword" type="password" autoComplete="current-password" required className="field" />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.new}</span>
        <input name="newPassword" type="password" autoComplete="new-password" required minLength={8} className="field" />
        <span className="mt-1 block text-xs text-muted">{labels.hint}</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.confirm}</span>
        <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className="field" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      {state?.ok && <p className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{ok[state.ok]}</p>}
      <button type="submit" disabled={pending} className={`btn ${mode === "change" ? "" : "w-full"}`}>
        {pending ? labels.saving : labels.submit}
      </button>
    </form>
  );
}
