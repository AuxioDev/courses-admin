"use client";

import { startTransition, useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
import { averageBand, formatAverage } from "@/lib/grading";
import { saveFinalGrades, setTermLocked } from "@/app/actions";
import { Feedback } from "./form-feedback";
import { Badge } from "./ui";

type Row = {
  id: string;
  name: string;
  enrolled: boolean;
  markCount: number;
  average: number | null;
  value: number | null;
  published: boolean;
};

const BAND_TONE = { good: "text-good", warn: "text-warn", bad: "text-bad" } as const;

export function FinalGradesForm({
  groupId,
  rows,
  locked,
  labels,
  errors,
  ok,
}: {
  groupId: string;
  rows: Row[];
  locked: boolean;
  labels: Dictionary["grades"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action, pending] = useActionState(saveFinalGrades, undefined);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.value === null ? "" : String(r.value)])),
  );

  const filled = rows.filter((r) => (values[r.id] ?? "").trim() !== "").length;
  const anyPublished = rows.some((r) => r.published);
  const submit = (intent: "save" | "publish" | "unpublish") => {
    const data = new FormData();
    data.set("groupId", groupId);
    data.set("intent", intent);
    for (const row of rows) data.set(`value:${row.id}`, values[row.id] ?? "");
    startTransition(() => action(data));
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-4 font-medium">{labels.student}</th>
              <th className="py-1 pr-4 font-medium">{labels.average}</th>
              <th className="py-1 pr-4 font-medium">{labels.finalGrade}</th>
              <th className="py-1 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-4">
                  <span className="font-medium">{row.name}</span>
                  {!row.enrolled && (
                    <span className="ml-2">
                      <Badge>{labels.left}</Badge>
                    </span>
                  )}
                  <span className="block text-xs text-muted">{fmt(labels.marks, { n: row.markCount })}</span>
                </td>
                <td className="py-2 pr-4 font-mono">
                  {row.average === null ? (
                    "—"
                  ) : (
                    <span className={BAND_TONE[averageBand(row.average)]}>{formatAverage(row.average)}</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    disabled={locked}
                    value={values[row.id] ?? ""}
                    onChange={(event) => setValues((v) => ({ ...v, [row.id]: event.target.value }))}
                    aria-label={fmt(labels.finalGradeFor, { name: row.name })}
                    className="field w-28 disabled:opacity-60"
                  />
                </td>
                <td className="py-2">
                  {row.value !== null &&
                    (row.published ? <Badge tone="good">{labels.published}</Badge> : <Badge tone="warn">{labels.draft}</Badge>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              setValues((current) =>
                Object.fromEntries(
                  rows.map((r) => [
                    r.id,
                    (current[r.id] ?? "").trim() === "" && r.average !== null ? String(r.average) : (current[r.id] ?? ""),
                  ]),
                ),
              )
            }
          >
            {labels.fill}
          </button>
          <button type="button" disabled={pending} className="btn-ghost disabled:opacity-60" onClick={() => submit("save")}>
            {labels.save}
          </button>
          <button
            type="button"
            disabled={pending}
            className="btn"
            onClick={() => {
              const missing = rows.filter((r) => r.enrolled).length - filled;
              const message = fmt(labels.publishConfirm, { n: filled });
              if (window.confirm(missing > 0 ? `${message}\n\n${fmt(labels.publishMissing, { n: missing })}` : message)) {
                submit("publish");
              }
            }}
          >
            {labels.publish}
          </button>
          {anyPublished && (
            <button
              type="button"
              disabled={pending}
              className="btn-ghost disabled:opacity-60"
              onClick={() => {
                if (window.confirm(labels.unpublishConfirm)) submit("unpublish");
              }}
            >
              {labels.unpublish}
            </button>
          )}
        </div>
      )}
      <Feedback state={state} errors={errors} ok={ok} />
    </div>
  );
}

export function TermLockButton({
  termId,
  locked,
  confirm,
  labels,
  errors,
  ok,
}: {
  termId: string;
  locked: boolean;
  confirm: string;
  labels: Dictionary["terms"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action, pending] = useActionState(setTermLocked, undefined);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="termId" value={termId} />
      <input type="hidden" name="locked" value={String(!locked)} />
      <button type="submit" disabled={pending} className={locked ? "btn-ghost disabled:opacity-60" : "btn"}>
        {locked ? labels.unlock : labels.lock}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
    </form>
  );
}
