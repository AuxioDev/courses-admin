"use client";

import { startTransition, useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
import { csvFile } from "@/lib/csv";
import { applyStudentImport, checkStudentImport } from "@/app/actions";
import { Badge } from "./ui";

type Props = { labels: Dictionary["users"]; errors: Dictionary["errors"] };

function download(rows: string[][]) {
  const url = URL.createObjectURL(new Blob([csvFile(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "temporary-passwords.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function StudentImport({ labels, errors }: Props) {
  const [text, setText] = useState("");
  // Accounts can only be created from exactly the text that was checked.
  const [checkedText, setCheckedText] = useState<string | null>(null);
  const [checkState, check, checking] = useActionState(checkStudentImport, undefined);
  const [applyState, apply, applying] = useActionState(applyStudentImport, undefined);

  if (applyState?.created) {
    const { created, skipped = 0 } = applyState;
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-xl bg-good-soft px-4 py-3">
          <p className="text-sm font-semibold text-good">{fmt(labels.csv.created, { n: created.length, skipped })}</p>
          <p className="mt-0.5 text-sm">{labels.csv.passwordsOnce}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() =>
            download([
              [labels.name, labels.email, labels.passwordTitle],
              ...created.map((c) => [c.name, c.email, c.password]),
            ])
          }
        >
          {labels.csv.download}
        </button>
        <div className="scroll-hint overflow-x-auto [--scroll-cover:var(--bg)]">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-4 font-medium">{labels.name}</th>
                <th className="py-1 pr-4 font-medium">{labels.email}</th>
                <th className="py-1 font-medium">{labels.passwordTitle}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {created.map((c) => (
                <tr key={c.email}>
                  <td className="py-1.5 pr-4">{c.name}</td>
                  <td className="py-1.5 pr-4">{c.email}</td>
                  <td className="py-1.5 font-mono">{c.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const preview = text === checkedText ? checkState?.preview : undefined;
  const fresh = preview?.rows.filter((r) => !r.exists).length ?? 0;
  const canApply = !!preview && preview.problems.length === 0 && fresh > 0;
  const error = checkState?.error ?? applyState?.error;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{labels.csv.intro}</p>
      <pre className="overflow-x-auto rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs">{labels.csv.example}</pre>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.csv.file}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="block min-h-11 py-2 text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setText(await file.text());
          }}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.csv.paste}</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          spellCheck={false}
          className="field font-mono text-sm"
        />
      </label>
      <button
        type="button"
        disabled={checking || applying}
        className="btn"
        onClick={() => {
          const data = new FormData();
          data.set("csv", text);
          setCheckedText(text);
          startTransition(() => check(data));
        }}
      >
        {checking ? labels.csv.checking : labels.csv.check}
      </button>
      {error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[error]}
        </p>
      )}
      {preview && (
        <div className="space-y-3">
          {preview.problems.length > 0 && (
            <div role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
              <p className="font-semibold">{labels.csv.fixFirst}</p>
              <ul className="mt-1 list-inside list-disc">
                {preview.problems.map((p, i) => (
                  <li key={i}>
                    {p.line !== null && `${fmt(labels.csv.line, { n: p.line })}: `}
                    {fmt(labels.csv.problems[p.key], { value: p.value ?? "" })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm">{fmt(labels.csv.summary, { n: fresh, skipped: preview.rows.length - fresh })}</p>
          <div className="scroll-hint overflow-x-auto [--scroll-cover:var(--bg)]">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-4 font-medium">{labels.name}</th>
                  <th className="py-1 pr-4 font-medium">{labels.email}</th>
                  <th className="py-1 pr-4 font-medium">{labels.csv.group}</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((row) => (
                  <tr key={row.line}>
                    <td className="py-1.5 pr-4">{row.name}</td>
                    <td className="py-1.5 pr-4">{row.email}</td>
                    <td className="py-1.5 pr-4">{row.group}</td>
                    <td className="py-1.5">{row.exists ? <Badge>{labels.csv.exists}</Badge> : <Badge tone="good">{labels.csv.isNew}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canApply && (
            <button
              type="button"
              disabled={checking || applying}
              className="btn"
              onClick={() => {
                const data = new FormData();
                data.set("csv", text);
                startTransition(() => apply(data));
              }}
            >
              {applying ? labels.csv.applying : fmt(labels.csv.apply, { n: fresh })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
