"use client";

import { startTransition, useActionState } from "react";
import type { MarkType } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { saveSettings } from "@/app/actions";
import { Feedback } from "./form-feedback";

const TYPES: MarkType[] = ["classwork", "quiz", "exam", "homework"];

export function SettingsForm({
  values,
  markTypes,
  labels,
  errors,
  ok,
}: {
  values: { attendanceWarnBelow: number; attendanceRiskBelow: number; weights: Record<MarkType, number> };
  markTypes: Dictionary["marks"]["type"];
  labels: Dictionary["settings"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  return (
    // Not <form action>: React resets the form after an action, which would wipe what
    // the admin typed whenever a field is rejected.
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{labels.attendanceTitle}</legend>
        <p className="text-xs text-muted">{labels.attendanceHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{labels.warnBelow}</span>
            <input
              name="attendanceWarnBelow"
              type="number"
              min={0}
              max={100}
              step={1}
              required
              defaultValue={values.attendanceWarnBelow}
              className="field"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{labels.riskBelow}</span>
            <input
              name="attendanceRiskBelow"
              type="number"
              min={0}
              max={100}
              step={1}
              required
              defaultValue={values.attendanceRiskBelow}
              className="field"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{labels.weightsTitle}</legend>
        <p className="text-xs text-muted">{labels.weightsHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.map((type) => (
            <label key={type} className="block">
              <span className="mb-1 block text-sm font-medium">{markTypes[type]}</span>
              <input
                name={`weight:${type}`}
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                required
                defaultValue={values.weights[type]}
                className="field"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <button type="submit" disabled={pending} className="btn">
          {pending ? labels.saving : labels.save}
        </button>
        <Feedback state={state} errors={errors} ok={ok} />
      </div>
    </form>
  );
}
