"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// The submit button of a plain <form action={serverAction}>. While the action runs it is disabled, so a second
// tap cannot send the form twice, and it can say what is happening. Forms built on useActionState already have
// `pending` and do not need this.
// With `pendingLabel`, both labels share one cell of a grid, so the button keeps the width of the longer one and
// nothing around it moves when the label changes.
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
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      aria-busy={pending}
      data-pending={pending ? "" : undefined}
      className={`${className} disabled:opacity-60`}
    >
      {pendingLabel ? (
        <span className="inline-grid justify-items-center">
          <span className={`col-start-1 row-start-1 ${pending ? "invisible" : ""}`}>{children}</span>
          <span className={`col-start-1 row-start-1 ${pending ? "" : "invisible"}`}>{pendingLabel}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
