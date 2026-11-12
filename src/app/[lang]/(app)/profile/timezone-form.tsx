"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { updateTimezone } from "@/app/actions";
import { FormMessage } from "@/components/form-kit";
import { SubmitButton } from "@/components/submit-button";

export function TimezoneForm({
  current,
  timezones,
  labels,
  errors,
  ok,
}: {
  current: string;
  timezones: string[];
  labels: { timezone: string; search: string; save: string; saving: string };
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action] = useActionState(updateTimezone, undefined);
  const options = timezones.includes(current) ? timezones : [current, ...timezones];
  // About 400 names: typing narrows the list ("baku", "new york"); the chosen one always stays in it.
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(current);
  const words = query.toLowerCase().replace(/[_/]/g, " ").split(/\s+/).filter(Boolean);
  const shown = options.filter((tz) => tz === chosen || words.every((w) => tz.toLowerCase().replace(/[_/]/g, " ").includes(w)));
  return (
    <form action={action} className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.timezone}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.search}
          aria-label={labels.search}
          autoComplete="off"
          spellCheck={false}
          className="field mb-2"
        />
        <select name="timezone" value={chosen} onChange={(event) => setChosen(event.target.value)} className="field">
          {shown.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>
      {state?.error && <FormMessage kind="error">{errors[state.error]}</FormMessage>}
      {state?.ok && <FormMessage kind="success">{ok[state.ok]}</FormMessage>}
      <SubmitButton className="btn" pendingLabel={labels.saving}>
        {labels.save}
      </SubmitButton>
    </form>
  );
}
