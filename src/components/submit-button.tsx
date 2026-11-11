"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// The submit button of a plain <form action={serverAction}>. While the action runs it is disabled, so a second
// tap cannot send the form twice, and it can say what is happening. Forms built on useActionState already have
// `pending` and do not need this.
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn",
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
