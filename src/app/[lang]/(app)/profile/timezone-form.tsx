"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { updateTimezone } from "@/app/actions";

export function TimezoneForm({
  current,
  timezones,
  labels,
  errors,
  ok,
}: {
  current: string;
  timezones: string[];
  labels: { timezone: string; save: string; saving: string };
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action, pending] = useActionState(updateTimezone, undefined);
  const options = timezones.includes(current) ? timezones : [current, ...timezones];
  return (
    <form action={action} className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.timezone}</span>
        <select name="timezone" defaultValue={current} className="field">
          {options.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>
      {state?.error && <p className="text-sm text-bad">{errors[state.error]}</p>}
      {state?.ok && <p className="text-sm text-good">{ok[state.ok]}</p>}
      <button type="submit" disabled={pending} className="btn">
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}
