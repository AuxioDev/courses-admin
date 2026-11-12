"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export type ConfirmLabels = { confirm: string; cancel: string };
type Ask = { message: ReactNode; title?: ReactNode; danger?: boolean; confirmLabel?: string };

// Replaces window.confirm: the same one-line question, but styled, translated, keyboard-safe and animated.
//   const { confirm, dialog } = useConfirm(labels);
//   async function onSubmit(event) { event.preventDefault(); if (!(await confirm({ message, danger: true }))) return; ... }
// For a <form action={serverAction}>, ask in onSubmit, then call event.currentTarget.requestSubmit() once confirmed.
// Render {dialog} once next to the form. Escape, the Cancel button and a click outside all answer "no".
export function useConfirm(labels: ConfirmLabels) {
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const confirm = useCallback(
    (options: Ask) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setAsk(options);
      }),
    [],
  );

  useEffect(() => {
    if (ask && ref.current && !ref.current.open) ref.current.showModal();
  }, [ask]);

  const answer = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    ref.current?.close();
  };

  const dialog = (
    <dialog
      ref={ref}
      aria-labelledby={ask?.title ? titleId : undefined}
      aria-describedby={bodyId}
      // Closed any other way (Escape) counts as "no".
      onClose={() => {
        resolver.current?.(false);
        resolver.current = null;
      }}
      // A click on the dim area outside the box lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) answer(false);
      }}
      className="confirm-dialog m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-0 text-ink"
    >
      <div className="space-y-4 p-5">
        {ask?.title && (
          <h2 id={titleId} className="text-base font-semibold">
            {ask.title}
          </h2>
        )}
        <p id={bodyId} className="text-sm">
          {ask?.message}
        </p>
        <div className="flex justify-end gap-2">
          {/* A destructive question starts on "Cancel", so a stray Enter cannot confirm it. */}
          <button type="button" autoFocus={ask?.danger} onClick={() => answer(false)} className="btn-ghost">
            {labels.cancel}
          </button>
          <button
            type="button"
            autoFocus={!ask?.danger}
            onClick={() => answer(true)}
            className={ask?.danger ? "btn !bg-bad !text-bg" : "btn"}
          >
            {ask?.confirmLabel ?? labels.confirm}
          </button>
        </div>
      </div>
    </dialog>
  );

  return { confirm, dialog };
}
