"use client";

import { useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { CopyButton } from "./form-kit";

// The password exists nowhere else: until it is copied, leaving the page asks first.
export function TempPasswordCard({
  account,
  labels,
  onCopied,
}: {
  account: { name: string; email: string; password: string };
  labels: Dictionary["users"];
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useUnsavedWarning(!copied);
  return (
    <div role="status" className="rounded-xl bg-good-soft px-4 py-3">
      <p className="text-sm font-semibold text-good">{labels.passwordTitle}</p>
      <p className="mt-0.5 text-sm">{fmt(labels.passwordOnce, { name: account.name })}</p>
      <p className="mt-2 text-sm text-muted">{account.email}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <code className="font-mono text-lg font-bold">{account.password}</code>
        <CopyButton
          text={account.password}
          labels={{ copy: labels.copy, copied: labels.copied, failed: labels.copyFailed }}
          onCopied={() => {
            setCopied(true);
            onCopied?.();
          }}
        />
      </div>
    </div>
  );
}
