"use client";

import { startTransition, useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { saveTerm } from "@/app/actions";

export function TermForm({
  term,
  labels,
  errors,
}: {
  term?: { id: string; name: string; startDate: string; endDate: string; locked: boolean };
  labels: Dictionary["terms"];
  errors: Dictionary["errors"];
}) {
  const [state, action, pending] = useActionState(saveTerm, undefined);
  const locked = term?.locked ?? false;
  return (
    // Not <form action>: React resets the form after an action, which would wipe what
    // the admin typed whenever a field is rejected.
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {term && <input type="hidden" name="termId" value={term.id} />}
      <fieldset disabled={locked} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{labels.name}</span>
          <input name="name" defaultValue={term?.name} required maxLength={100} className="field disabled:opacity-60" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{labels.start}</span>
            <input name="startDate" type="date" defaultValue={term?.startDate} required className="field disabled:opacity-60" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{labels.end}</span>
            <input name="endDate" type="date" defaultValue={term?.endDate} required className="field disabled:opacity-60" />
          </label>
        </div>
      </fieldset>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      {!locked && (
        <button type="submit" disabled={pending} className="btn">
          {pending ? labels.saving : term ? labels.save : labels.create}
        </button>
      )}
    </form>
  );
}
