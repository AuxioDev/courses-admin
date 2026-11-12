"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { changePassword, resetPassword, type FormState } from "@/app/actions";
import { PasswordField } from "@/components/password-field";
import { FormMessage } from "@/components/form-kit";
import { SubmitButton } from "@/components/submit-button";
import { passwordChecks } from "@/lib/form-kit";

type Props = {
  labels: Dictionary["password"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
  // The account's email, so a password manager knows which login the new password belongs to.
  username?: string;
} & (
  | { mode: "change" | "forced"; token?: never }
  | { mode: "reset"; token: string }
);

const EMPTY = { current: "", next: "", confirm: "" };

// "change": from Profile; "forced": after logging in with a temporary password;
// "reset": from a one-time link, so no current password is asked for.
// The boxes keep what was typed when the server says no; they empty only once the password is saved.
export function PasswordForm({ mode, token, username, labels, errors, ok }: Props) {
  const [values, setValues] = useState(EMPTY);
  const [edited, setEdited] = useState(false);
  const [state, action] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await (mode === "reset" ? resetPassword : changePassword)(previous, formData);
    if (result?.ok) setValues(EMPTY);
    setEdited(false);
    return result;
  }, undefined);

  const checks = passwordChecks(values.next, values.confirm);
  const fieldLabels = { show: labels.showPassword, hide: labels.hidePassword, capsLock: labels.capsLock };
  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    setEdited(true);
  };

  return (
    <form action={action} className="space-y-3">
      {username && (
        // Not hidden from the browser, only from view, or password managers would ignore it.
        <input type="text" autoComplete="username" value={username} readOnly tabIndex={-1} aria-hidden className="sr-only" />
      )}
      {mode === "reset" ? (
        <input type="hidden" name="token" value={token} />
      ) : (
        <PasswordField
          name="currentPassword"
          label={mode === "forced" ? labels.temporary : labels.current}
          labels={fieldLabels}
          autoComplete="current-password"
          required
          value={values.current}
          onChange={set("current")}
        />
      )}
      <PasswordField
        name="newPassword"
        label={labels.new}
        labels={fieldLabels}
        autoComplete="new-password"
        required
        minLength={8}
        value={values.next}
        onChange={set("next")}
        hint={<span className={checks.longEnough ? "text-good" : undefined}>{labels.hint}</span>}
      />
      <PasswordField
        name="confirmPassword"
        label={labels.confirm}
        labels={fieldLabels}
        autoComplete="new-password"
        required
        minLength={8}
        value={values.confirm}
        onChange={set("confirm")}
      />
      {/* In the page from the start, so the change is announced; it says nothing until the second box has a letter in it. */}
      <p role="status" className={`text-xs empty:hidden ${checks.matches ? "text-good" : "text-muted"}`}>
        {checks.confirmStarted ? (checks.matches ? labels.matchOk : labels.matchNo) : null}
      </p>
      {state?.error && <FormMessage kind="error">{errors[state.error]}</FormMessage>}
      {state?.ok && !edited && <FormMessage kind="success">{ok[state.ok]}</FormMessage>}
      <SubmitButton className={`btn ${mode === "change" ? "" : "w-full"}`} pendingLabel={labels.saving}>
        {labels.submit}
      </SubmitButton>
    </form>
  );
}
