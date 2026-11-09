"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { login } from "@/app/actions";

// The page to return to after login. In its own boundary so the page stays prerendered.
function NextField() {
  const next = useSearchParams().get("next");
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

export function LoginForm({ labels, errors }: { labels: Dictionary["login"]; errors: Dictionary["errors"] }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-3">
      <Suspense>
        <NextField />
      </Suspense>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.email}</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.password}</span>
        <input name="password" type="password" autoComplete="current-password" required className="field" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? labels.pending : labels.submit}
      </button>
    </form>
  );
}
