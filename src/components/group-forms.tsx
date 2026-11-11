"use client";

import { startTransition, useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
import { changeGroupTeacher, enrolStudents, saveGroup, setEnrollmentStatus } from "@/app/actions";
import { Feedback } from "./form-feedback";

type Text = { labels: Dictionary["groups"]; errors: Dictionary["errors"]; ok: Dictionary["ok"] };
type Options = {
  courses: { id: string; title: string }[];
  teachers: { id: string; name: string }[];
  terms: { id: string; name: string }[];
};

// Not <form action> on these: React resets the form after an action, which would wipe
// what the admin chose whenever something is rejected.
export function GroupForm({
  group,
  structureLocked = false,
  disabled = false,
  options,
  labels,
  errors,
  ok,
}: Text & {
  group?: {
    id: string;
    name: string;
    courseId: string;
    termId: string;
    capacity: number | null;
    monthlyPrice: number | null;
    enrollmentOpen: boolean;
  };
  structureLocked?: boolean;
  disabled?: boolean;
  options: Options;
}) {
  const [state, action, pending] = useActionState(saveGroup, undefined);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {group && <input type="hidden" name="groupId" value={group.id} />}
      <fieldset disabled={disabled} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{labels.name}</span>
          <input name="name" defaultValue={group?.name} required maxLength={100} autoComplete="off" className="field disabled:opacity-60" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{labels.course}</span>
          <select name="courseId" defaultValue={group?.courseId} required disabled={structureLocked} className="field disabled:opacity-60">
            {options.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        {!group && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{labels.teacher}</span>
            <select name="teacherId" required className="field">
              {options.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{labels.term}</span>
          <select name="termId" defaultValue={group?.termId} required disabled={structureLocked} className="field disabled:opacity-60">
            {options.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {structureLocked && <p className="text-xs text-muted">{labels.structureLocked}</p>}
        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{labels.website}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{labels.capacity}</span>
              <input
                name="capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                defaultValue={group?.capacity ?? ""}
                placeholder={labels.capacityHint}
                className="field disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{labels.monthlyPrice}</span>
              <input
                name="monthlyPrice"
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                defaultValue={group?.monthlyPrice ?? ""}
                className="field disabled:opacity-60"
              />
            </label>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="enrollmentOpen"
              defaultChecked={group?.enrollmentOpen}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-medium">{labels.enrollmentOpen}</span>
              <span className="block text-xs text-muted">{labels.enrollmentOpenHint}</span>
            </span>
          </label>
        </fieldset>
      </fieldset>
      {!disabled && (
        <button type="submit" disabled={pending} className="btn">
          {pending ? labels.saving : group ? labels.save : labels.create}
        </button>
      )}
      <Feedback state={state} errors={errors} ok={ok} />
    </form>
  );
}

export function TeacherChangeForm({
  groupId,
  currentTeacherId,
  teachers,
  preview,
  labels,
  errors,
  ok,
}: Text & {
  groupId: string;
  currentTeacherId: string;
  teachers: Options["teachers"];
  preview: string;
}) {
  const [state, action, pending] = useActionState(changeGroupTeacher, undefined);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(`${labels.changeTeacherConfirm}\n\n${preview}`)) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.newTeacher}</span>
        <select name="teacherId" defaultValue={currentTeacherId} className="field">
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted">{preview}</p>
      <button type="submit" disabled={pending} className="btn-ghost disabled:opacity-60">
        {labels.changeTeacher}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
    </form>
  );
}

export function EnrolForm({
  groupId,
  students,
  labels,
  errors,
  ok,
}: Text & { groupId: string; students: { id: string; name: string; email: string }[] }) {
  const [state, action, pending] = useActionState(enrolStudents, undefined);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const query = filter.trim().toLowerCase();
  const visible = students.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(query));
  // Students enrolled a moment ago are no longer offered, so they stop counting by themselves.
  const chosen = students.filter((s) => selected.has(s.id));

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData();
        data.set("groupId", groupId);
        for (const student of chosen) data.append("studentId", student.id);
        startTransition(() => action(data));
      }}
    >
      <input
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder={labels.filterStudents}
        aria-label={labels.filterStudents}
        className="field"
      />
      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {visible.map((student) => (
          <li key={student.id}>
            <label className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                checked={selected.has(student.id)}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(student.id);
                  else next.delete(student.id);
                  setSelected(next);
                }}
              />
              <span className="min-w-0">
                <span className="block font-medium">{student.name}</span>
                <span className="block truncate text-xs text-muted">{student.email}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="submit" disabled={pending || chosen.length === 0} className="btn">
        {fmt(labels.addStudents, { n: chosen.length })}
      </button>
      <Feedback state={state} errors={errors} ok={ok} />
    </form>
  );
}

// Dropping asks first. Bringing a student back doesn't need to.
export function EnrollmentButton({
  enrollmentId,
  status,
  label,
  confirm,
  errors,
  ok,
}: {
  enrollmentId: string;
  status: "active" | "dropped";
  label: string;
  confirm?: string;
  errors: Text["errors"];
  ok: Text["ok"];
}) {
  const [state, action, pending] = useActionState(setEnrollmentStatus, undefined);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" disabled={pending} className="btn-ghost disabled:opacity-60">
        {label}
      </button>
      {state?.error && <Feedback state={state} errors={errors} ok={ok} />}
    </form>
  );
}
