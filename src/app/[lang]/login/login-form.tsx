"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { login } from "@/app/actions";
import { PasswordField } from "@/components/password-field";
import { FormMessage } from "@/components/form-kit";
import { SubmitButton } from "@/components/submit-button";

// The page to return to after login. In its own boundary so the page stays prerendered.
function NextField() {
  const next = useSearchParams().get("next");
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

export function LoginForm({
  labels,
  errors,
  passwordLabels,
}: {
  labels: Dictionary["login"];
  errors: Dictionary["errors"];
  passwordLabels: Dictionary["password"];
}) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <Suspense>
        <NextField />
      </Suspense>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.email}</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state?.email}
          className="field"
        />
      </label>
      {/* The password is not kept after a refusal: the person types it again. */}
      <PasswordField
        name="password"
        label={labels.password}
        labels={{ show: passwordLabels.showPassword, hide: passwordLabels.hidePassword, capsLock: passwordLabels.capsLock }}
        autoComplete="current-password"
        required
      />
      {state?.error && <FormMessage kind="error">{errors[state.error]}</FormMessage>}
      <SubmitButton className="btn w-full" pendingLabel={labels.pending}>
        {labels.submit}
      </SubmitButton>
    </form>
  );
}
