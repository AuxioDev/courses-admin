"use client";

import { startTransition, useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import {
  approveDeletion,
  deactivateUser,
  issueTempPassword,
  reactivateUser,
  sendUserResetLink,
  updateUser,
  type FormState,
} from "@/app/actions";
import { Feedback } from "./form-feedback";
import { TempPasswordCard } from "./temp-password-card";

type Text = { labels: Dictionary["users"]; errors: Dictionary["errors"]; ok: Dictionary["ok"] };

export function UserDetailsForm({
  user,
  labels,
  errors,
  ok,
}: Text & { user: { id: string; name: string; email: string; role: string; bio: string | null; showOnWebsite: boolean } }) {
  const [state, action, pending] = useActionState(updateUser, undefined);
  return (
    // Not <form action>: React resets the form after an action, which would wipe what
    // the admin typed whenever a field is rejected.
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="userId" value={user.id} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.name}</span>
        <input name="name" defaultValue={user.name} required maxLength={100} autoComplete="off" className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.email}</span>
        <input name="email" type="email" defaultValue={user.email} required maxLength={254} autoComplete="off" className="field" />
      </label>
      {user.role === "teacher" && (
        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{labels.website}</legend>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{labels.bio}</span>
            <textarea name="bio" defaultValue={user.bio ?? ""} rows={4} maxLength={2000} className="field" />
            <span className="mt-1 block text-xs text-muted">{labels.bioHint}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="showOnWebsite"
              defaultChecked={user.showOnWebsite}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-medium">{labels.showOnWebsite}</span>
              <span className="block text-xs text-muted">{labels.showOnWebsiteHint}</span>
            </span>
          </label>
        </fieldset>
      )}
      <button type="submit" disabled={pending} className="btn">
        {pending ? labels.saving : labels.save}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
    </form>
  );
}

// One button that asks first, runs an action on this user and reports the result.
function UserActionButton({
  userId,
  action: serverAction,
  label,
  confirm,
  danger,
  errors,
  ok,
}: {
  userId: string;
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  label: string;
  confirm?: string;
  danger?: boolean;
  errors: Text["errors"];
  ok: Text["ok"];
}) {
  const [state, action, pending] = useActionState(serverAction, undefined);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className={`btn-ghost disabled:opacity-60 ${danger ? "text-bad" : ""}`}>
        {label}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
    </form>
  );
}

export function TempPasswordButton({ userId, labels, errors }: Omit<Text, "ok"> & { userId: string }) {
  const [state, action, pending] = useActionState(issueTempPassword, undefined);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(labels.newPasswordConfirm)) event.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="btn-ghost disabled:opacity-60">
        {labels.newPassword}
      </button>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      {state?.account && <TempPasswordCard account={state.account} labels={labels} />}
    </form>
  );
}

export function ResetLinkButton({ userId, labels, errors, ok }: Text & { userId: string }) {
  return <UserActionButton userId={userId} action={sendUserResetLink} label={labels.sendLink} errors={errors} ok={ok} />;
}

export function DeactivateButton({
  userId,
  warning,
  labels,
  errors,
  ok,
}: Text & { userId: string; warning: string | null }) {
  return (
    <UserActionButton
      userId={userId}
      action={deactivateUser}
      label={labels.deactivate}
      confirm={warning ? `${labels.deactivateConfirm}\n\n${warning}` : labels.deactivateConfirm}
      danger
      errors={errors}
      ok={ok}
    />
  );
}

export function ReactivateButton({ userId, labels, errors, ok }: Text & { userId: string }) {
  return <UserActionButton userId={userId} action={reactivateUser} label={labels.reactivate} errors={errors} ok={ok} />;
}

export function ApproveDeletionButton({ userId, labels, errors, ok }: Text & { userId: string }) {
  return (
    <UserActionButton
      userId={userId}
      action={approveDeletion}
      label={labels.approve}
      confirm={labels.approveConfirm}
      danger
      errors={errors}
      ok={ok}
    />
  );
}
