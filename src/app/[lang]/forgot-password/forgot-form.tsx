"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { requestPasswordReset } from "@/app/actions";

export function ForgotForm({
  labels,
  errors,
  ok,
}: {
  labels: Dictionary["forgot"] & { email: string };
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.ok) {
    return (
      <p role="status" className="rounded-xl bg-good-soft px-3 py-3 text-sm text-good">
        {ok[state.ok]}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.email}</span>
        <input name="email" type="email" autoComplete="email" required className="field" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? labels.sending : labels.submit}
      </button>
    </form>
  );
}
