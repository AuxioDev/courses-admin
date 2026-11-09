"use client";

import { useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";

export function TempPasswordCard({
  account,
  labels,
}: {
  account: { name: string; email: string; password: string };
  labels: Dictionary["users"];
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-xl bg-good-soft px-4 py-3">
      <p className="text-sm font-semibold text-good">{labels.passwordTitle}</p>
      <p className="mt-0.5 text-sm">{fmt(labels.passwordOnce, { name: account.name })}</p>
      <p className="mt-2 text-sm text-muted">{account.email}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <code className="font-mono text-lg font-bold">{account.password}</code>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(account.password);
            setCopied(true);
          }}
        >
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
    </div>
  );
}
