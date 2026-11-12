"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

export type ConfirmLabels = { confirm: string; cancel: string };

// Put once in a layout so every form below can ask without being handed the button texts.
const LabelsContext = createContext<ConfirmLabels>({ confirm: "OK", cancel: "Cancel" });
export function ConfirmLabelsProvider({ labels, children }: { labels: ConfirmLabels; children: ReactNode }) {
  return <LabelsContext value={labels}>{children}</LabelsContext>;
}
type Ask = { message: ReactNode; title?: ReactNode; danger?: boolean; confirmLabel?: string };

// Replaces window.confirm: the same one-line question, but styled, translated, keyboard-safe and animated.
//   const { confirm, dialog } = useConfirm(labels);
//   async function onSubmit(event) { event.preventDefault(); if (!(await confirm({ message, danger: true }))) return; ... }
// For a <form action={serverAction}>, ask in onSubmit, then call event.currentTarget.requestSubmit() once confirmed.
// Render {dialog} once next to the form. Escape, the Cancel button and a click outside all answer "no".
export function useConfirm(given?: ConfirmLabels) {
  const fromLayout = useContext(LabelsContext);
  const labels = given ?? fromLayout;
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
    const dialog = ref.current;
    if (!ask || !dialog || dialog.open) return;
    dialog.showModal();
    // The autoFocus prop only counts when an element first appears, and this one is reused, so focus is placed here:
    // a destructive question starts on "Cancel" (a stray Enter cannot confirm it), any other on the confirming button.
    dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
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
        <p id={bodyId} className="whitespace-pre-line text-sm">
          {ask?.message}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" data-initial-focus={ask?.danger ? "" : undefined} onClick={() => answer(false)} className="btn-ghost">
            {labels.cancel}
          </button>
          <button
            type="button"
            data-initial-focus={ask?.danger ? undefined : ""}
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

// A <form action={serverAction}> that asks first. The submit is held back, the question is shown, and only a "yes"
// sends the form (again, with requestSubmit), so the action, its pending state and its errors work as usual.
export function ConfirmForm({
  action,
  message,
  title,
  danger = true,
  labels,
  confirmLabel,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message?: ReactNode; // without one, the form is sent as it is
  title?: ReactNode;
  danger?: boolean;
  labels?: ConfirmLabels;
  confirmLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const { confirm, dialog } = useConfirm(labels);
  const sure = useRef(false);
  return (
    <form
      action={action}
      className={className}
      onSubmit={async (event) => {
        if (sure.current || message === undefined) {
          sure.current = false;
          return;
        }
        event.preventDefault();
        const form = event.currentTarget;
        if (await confirm({ message, title, danger, confirmLabel })) {
          sure.current = true;
          form.requestSubmit();
        }
      }}
    >
      {children}
      {dialog}
    </form>
  );
}
