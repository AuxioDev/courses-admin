"use client";

import { startTransition, useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import {
  cancelLesson,
  changeLessonTeacher,
  createLesson,
  moveLesson,
  restoreLesson,
  setLessonLink,
  type FormState,
} from "@/app/actions";
import { Feedback } from "./form-feedback";
import { useConfirm } from "./confirm-dialog";

type Text = { labels: Dictionary["lesson"]; errors: Dictionary["errors"]; ok: Dictionary["ok"] };
type Action = (prev: FormState, data: FormData) => Promise<FormState>;

// Not <form action>: React resets the form after an action, which would wipe what
// the admin typed whenever something is rejected.
function useKeptForm(serverAction: Action, confirmMessage?: string, danger = false) {
  const [state, action, pending] = useActionState(serverAction, undefined);
  const { confirm, dialog } = useConfirm();
  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (confirmMessage && !(await confirm({ message: confirmMessage, danger }))) return;
    const data = new FormData(form);
    startTransition(() => action(data));
  };
  return { state, pending, onSubmit, dialog };
}

function SlotFields({
  labels,
  values,
  min,
  max,
}: {
  labels: Text["labels"];
  values?: { day: string; start: string; end: string };
  min?: string;
  max?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 block">
        <span className="mb-1 block text-sm font-medium">{labels.date}</span>
        <input name="date" type="date" defaultValue={values?.day} min={min} max={max} required className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.start}</span>
        <input name="start" type="time" defaultValue={values?.start ?? "18:00"} required className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.end}</span>
        <input name="end" type="time" defaultValue={values?.end ?? "19:30"} required className="field" />
      </label>
    </div>
  );
}

export function NewLessonForm({
  groups,
  selectedGroup,
  today,
  labels,
  errors,
  ok,
}: Text & {
  groups: { id: string; name: string; course: { title: string }; term: { name: string } }[];
  selectedGroup?: string;
  today: string;
}) {
  const { state, pending, onSubmit } = useKeptForm(createLesson);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.group}</span>
        <select name="groupId" defaultValue={selectedGroup} required className="field">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} · {g.course.title} · {g.term.name}
            </option>
          ))}
        </select>
      </label>
      <SlotFields labels={labels} min={today} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.meetingUrl}</span>
        <input name="meetingUrl" type="url" placeholder="https://…" maxLength={2000} className="field" />
      </label>
      <button type="submit" disabled={pending} className="btn">
        {pending ? labels.saving : labels.create}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
    </form>
  );
}

export function MoveForm({
  lessonId,
  values,
  min,
  max,
  labels,
  errors,
  ok,
}: Text & { lessonId: string; values: { day: string; start: string; end: string }; min: string; max: string }) {
  const { state, pending, onSubmit, dialog } = useKeptForm(moveLesson, labels.moveConfirm);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <SlotFields labels={labels} values={values} min={min} max={max} />
      <button type="submit" disabled={pending} className="btn">
        {pending ? labels.saving : labels.move}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
      {dialog}
    </form>
  );
}

export function TeacherForm({
  lessonId,
  currentTeacherId,
  teachers,
  labels,
  errors,
  ok,
}: Text & { lessonId: string; currentTeacherId: string; teachers: { id: string; name: string }[] }) {
  const { state, pending, onSubmit, dialog } = useKeptForm(changeLessonTeacher, labels.teacherConfirm);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <select name="teacherId" defaultValue={currentTeacherId} aria-label={labels.teacher} className="field">
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted">{labels.teacherHint}</p>
      <button type="submit" disabled={pending} className="btn-ghost disabled:opacity-60">
        {labels.changeTeacher}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
      {dialog}
    </form>
  );
}

export function LinkForm({
  lessonId,
  meetingUrl,
  labels,
  errors,
  ok,
}: Text & { lessonId: string; meetingUrl: string }) {
  const { state, pending, onSubmit } = useKeptForm(setLessonLink);
  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input
        name="meetingUrl"
        type="url"
        defaultValue={meetingUrl}
        placeholder="https://…"
        maxLength={2000}
        aria-label={labels.meetingUrl}
        className="field"
      />
      <button type="submit" disabled={pending} className="btn-ghost disabled:opacity-60">
        {labels.saveLink}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
    </form>
  );
}

function LessonButton({
  lessonId,
  action: serverAction,
  label,
  confirm,
  danger,
  errors,
  ok,
}: Omit<Text, "labels"> & { lessonId: string; action: Action; label: string; confirm?: string; danger?: boolean }) {
  const { state, pending, onSubmit, dialog } = useKeptForm(serverAction, confirm, danger);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <button type="submit" disabled={pending} className={`btn-ghost disabled:opacity-60 ${danger ? "text-bad" : ""}`}>
        {label}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
      {dialog}
    </form>
  );
}

export function CancelButton({ lessonId, labels, errors, ok }: Text & { lessonId: string }) {
  return (
    <LessonButton
      lessonId={lessonId}
      action={cancelLesson}
      label={labels.cancel}
      confirm={labels.cancelConfirm}
      danger
      errors={errors}
      ok={ok}
    />
  );
}

export function RestoreButton({ lessonId, labels, errors, ok }: Text & { lessonId: string }) {
  return (
    <LessonButton lessonId={lessonId} action={restoreLesson} label={labels.restore} errors={errors} ok={ok} />
  );
}
