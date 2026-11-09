"use client";

import { startTransition, useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { saveCourse } from "@/app/actions";

export function CourseForm({
  course,
  labels,
  errors,
}: {
  course?: { id: string; title: string; description: string | null };
  labels: Dictionary["courses"];
  errors: Dictionary["errors"];
}) {
  const [state, action, pending] = useActionState(saveCourse, undefined);
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
      {course && <input type="hidden" name="courseId" value={course.id} />}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.titleField}</span>
        <input name="title" defaultValue={course?.title} required maxLength={200} className="field" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.description}</span>
        <textarea name="description" defaultValue={course?.description ?? ""} rows={5} maxLength={5000} className="field" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn">
        {pending ? labels.saving : course ? labels.save : labels.create}
      </button>
    </form>
  );
}
