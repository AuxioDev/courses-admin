"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { requestPasswordReset } from "@/app/actions";
import { FormMessage } from "@/components/form-kit";
import { SubmitButton } from "@/components/submit-button";

export function ForgotForm({
  labels,
  errors,
  ok,
}: {
  labels: Dictionary["forgot"] & { email: string };
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  // Kept in the page, so the address is still there when the server says "not now".
  const [email, setEmail] = useState("");
  if (state?.ok) return <FormMessage kind="success">{ok[state.ok]}</FormMessage>;
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.email}</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="field"
        />
      </label>
      {state?.error && <FormMessage kind="error">{errors[state.error]}</FormMessage>}
      <SubmitButton className="btn w-full" pendingLabel={labels.sending}>
        {labels.submit}
      </SubmitButton>
    </form>
  );
}
