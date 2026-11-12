"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localePath, type Locale } from "@/i18n/config";
import { approveApplication, setApplicationStatus } from "@/app/actions";
import { Feedback } from "./form-feedback";
import { TempPasswordCard } from "./temp-password-card";
import { ConfirmForm } from "./confirm-dialog";

type Text = {
  labels: Dictionary["applications"];
  userLabels: Dictionary["users"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
};

function StatusButton({
  applicationId,
  status,
  label,
  confirm,
  errors,
  ok,
}: Pick<Text, "errors" | "ok"> & { applicationId: string; status: "contacted" | "rejected"; label: string; confirm?: string }) {
  const [state, action, pending] = useActionState(setApplicationStatus, undefined);
  return (
    <ConfirmForm action={action} message={confirm} danger={status === "rejected"}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" disabled={pending} className={`btn-ghost disabled:opacity-60 ${status === "rejected" ? "text-bad" : ""}`}>
        {label}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
    </ConfirmForm>
  );
}

// Approve, mark as contacted, or reject. After an approval the page shows the result here:
// the new student's one-time password, which exists nowhere else.
export function ApplicationActions({
  locale,
  applicationId,
  status,
  approveHint,
  labels,
  userLabels,
  errors,
  ok,
}: Text & { locale: Locale; applicationId: string; status: "new" | "contacted"; approveHint: string }) {
  const [state, action, pending] = useActionState(approveApplication, undefined);

  if (state?.approved) {
    const { approved } = state;
    return (
      <div className="space-y-3">
        {approved.password ? (
          <TempPasswordCard account={{ ...approved, password: approved.password }} labels={userLabels} />
        ) : (
          <p role="status" className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">
            {labels.approvedExisting}
          </p>
        )}
        <Link href={localePath(locale, `/users/${approved.studentId}`)} className="btn-ghost">
          {userLabels.openUser}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ConfirmForm action={action} message={`${labels.approveConfirm}\n\n${approveHint}`} danger={false}>
        <input type="hidden" name="applicationId" value={applicationId} />
        <button type="submit" disabled={pending} className="btn">
          {pending ? labels.approving : labels.approve}
        </button>
        <p className="mt-1 text-xs text-muted">{approveHint}</p>
        {state?.error && (
          <p role="alert" className="mt-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
            {errors[state.error]}
          </p>
        )}
      </ConfirmForm>
      <div className="flex flex-wrap gap-2">
        {status === "new" && (
          <StatusButton applicationId={applicationId} status="contacted" label={labels.markContacted} errors={errors} ok={ok} />
        )}
        <StatusButton
          applicationId={applicationId}
          status="rejected"
          label={labels.reject}
          confirm={labels.rejectConfirm}
          errors={errors}
          ok={ok}
        />
      </div>
    </div>
  );
}
