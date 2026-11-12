"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localePath, type Locale } from "@/i18n/config";
import { createUser } from "@/app/actions";
import { TempPasswordCard } from "./temp-password-card";
import { useConfirm } from "./confirm-dialog";

type Props = { locale: Locale; labels: Dictionary["users"]; errors: Dictionary["errors"] };

function Form({ locale, labels, errors, onAnother }: Props & { onAnother: () => void }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const [copied, setCopied] = useState(false);
  const { confirm, dialog } = useConfirm();

  if (state?.account) {
    return (
      <div className="space-y-4">
        <TempPasswordCard account={state.account} labels={labels} onCopied={() => setCopied(true)} />
        <div className="flex flex-wrap gap-2">
          {/* Starting over forgets the password just shown, so ask unless it was copied. */}
          <button
            type="button"
            onClick={async () => {
              if (copied || (await confirm({ message: labels.addAnotherConfirm, danger: true }))) onAnother();
            }}
            className="btn"
          >
            {labels.addAnother}
          </button>
          <Link href={localePath(locale, `/users/${state.account.id}`)} className="btn-ghost">
            {labels.openUser}
          </Link>
        </div>
        {dialog}
      </div>
    );
  }

  return (
    // Not <form action>: React resets the form after an action, which would wipe what
    // the admin typed whenever a field is rejected.
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.role}</span>
        <select name="role" defaultValue="student" className="field">
          <option value="student">{labels.roles.student}</option>
          <option value="teacher">{labels.roles.teacher}</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.name}</span>
        <input name="name" required maxLength={100} autoComplete="off" className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.email}</span>
        <input name="email" type="email" required maxLength={254} autoComplete="off" className="field" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn">
        {pending ? labels.creating : labels.create}
      </button>
    </form>
  );
}

export function NewUserForm(props: Props) {
  // A new key gives a blank form and forgets the password just shown.
  const [round, setRound] = useState(0);
  return <Form key={round} {...props} onAnother={() => setRound((r) => r + 1)} />;
}
