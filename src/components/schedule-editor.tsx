"use client";

import { startTransition, useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { formatDayKey, weekdayNames } from "@/lib/dates";
import { rulesOverlap, sortRules } from "@/lib/schedule-rules";
import type { Clash, SchedulePlan } from "@/lib/schedule-plan";
import { applySchedule, previewSchedule } from "@/app/actions";
import { Badge } from "./ui";
import { TrashIcon } from "./icons";

type Labels = Dictionary["schedule"];
type Errors = Dictionary["errors"];
type Row = { key: number; weekday: number; startTime: string; endTime: string };

function Alert({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
      {children}
    </p>
  );
}

function clashText(clash: Exclude<Clash, null>, labels: Labels) {
  return fmt(clash.kind === "teacher" ? labels.clashTeacher : labels.clashGroup, { group: clash.group });
}

type TickRow = {
  id: string;
  day: string;
  time: string;
  disabled?: boolean;
  note?: { text: string; tone: "bad" | "warn" } | null;
};

function TickList({
  title,
  rows,
  ticked,
  onChange,
  locale,
}: {
  title: string;
  rows: TickRow[];
  ticked: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  locale: Locale;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">
        {title} <span className="font-normal text-muted">({rows.length})</span>
      </h3>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {rows.map((row) => (
          <li key={row.id}>
            <label className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                disabled={row.disabled}
                checked={ticked.has(row.id)}
                onChange={(event) => {
                  const next = new Set(ticked);
                  if (event.target.checked) next.add(row.id);
                  else next.delete(row.id);
                  onChange(next);
                }}
              />
              <span className="min-w-40 first-letter:uppercase">
                {formatDayKey(row.day, locale, { weekday: "short", month: "short", year: "numeric" })}
              </span>
              <span className="font-mono">{row.time}</span>
              {row.note && <Badge tone={row.note.tone}>{row.note.text}</Badge>}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreviewPanel({
  preview,
  groupId,
  rulesJson,
  meetingUrl,
  applyLink,
  locale,
  labels,
  errors,
}: {
  preview: SchedulePlan;
  groupId: string;
  rulesJson: string;
  meetingUrl: string;
  applyLink: boolean;
  locale: Locale;
  labels: Labels;
  errors: Errors;
}) {
  const [state, action, pending] = useActionState(applySchedule, undefined);
  // A week with a moved lesson may be recreating the slot it moved away from, so that needs a person.
  const [create, setCreate] = useState<ReadonlySet<string>>(
    () => new Set(preview.create.filter((r) => !r.clash && !r.movedNearby).map((r) => r.id)),
  );
  const [remove, setRemove] = useState<ReadonlySet<string>>(() => new Set(preview.remove.map((r) => r.id)));
  const [update, setUpdate] = useState<ReadonlySet<string>>(
    () => new Set(preview.update.filter((r) => !r.clash).map((r) => r.id)),
  );

  if (state?.applied) {
    return (
      <p role="status" className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">
        {fmt(labels.applied, state.applied)}
      </p>
    );
  }

  const nothingToDo =
    !preview.rulesChanged && !applyLink && preview.create.length + preview.remove.length + preview.update.length === 0;

  return (
    <div className="space-y-4">
      {nothingToDo && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{labels.upToDate}</p>}
      <TickList
        title={labels.toCreate}
        rows={preview.create.map((r) => ({
          id: r.id,
          day: r.day,
          time: `${r.start}–${r.end}`,
          disabled: !!r.clash,
          note: r.clash
            ? { text: clashText(r.clash, labels), tone: "bad" as const }
            : r.movedNearby
              ? { text: labels.movedNearby, tone: "warn" as const }
              : r.sharedStudentsIn
                ? { text: fmt(labels.sharedStudents, { group: r.sharedStudentsIn }), tone: "warn" as const }
                : null,
        }))}
        ticked={create}
        onChange={setCreate}
        locale={locale}
      />
      <TickList
        title={labels.toRemove}
        rows={preview.remove.map((r) => ({ id: r.id, day: r.day, time: `${r.start}–${r.end}` }))}
        ticked={remove}
        onChange={setRemove}
        locale={locale}
      />
      <TickList
        title={labels.toUpdate}
        rows={preview.update.map((r) => ({
          id: r.id,
          day: r.day,
          time: `${r.start}–${r.end} → ${r.start}–${r.newEnd}`,
          disabled: !!r.clash,
          note: r.clash ? { text: clashText(r.clash, labels), tone: "bad" as const } : null,
        }))}
        ticked={update}
        onChange={setUpdate}
        locale={locale}
      />
      {preview.leftAlone.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">
            {labels.leftAlone} <span className="font-normal text-muted">({preview.leftAlone.length})</span>
          </h3>
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {preview.leftAlone.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-40 first-letter:uppercase">
                  {formatDayKey(r.day, locale, { weekday: "short", month: "short", year: "numeric" })}
                </span>
                <span className="font-mono">
                  {r.start}–{r.end}
                </span>
                <Badge>{labels.leftAloneReason[r.reason]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
      {state?.error && <Alert>{errors[state.error]}</Alert>}
      {(preview.rulesChanged || applyLink || create.size + remove.size + update.size > 0) && (
        <button
          type="button"
          disabled={pending}
          className="btn"
          onClick={() => {
            const data = new FormData();
            data.set("groupId", groupId);
            data.set("rules", rulesJson);
            data.set("meetingUrl", meetingUrl);
            if (applyLink) data.set("applyLinkToFuture", "on");
            for (const id of create) data.append("create", id);
            for (const id of remove) data.append("remove", id);
            for (const id of update) data.append("update", id);
            startTransition(() => action(data));
          }}
        >
          {pending
            ? labels.applying
            : fmt(labels.apply, { created: create.size, removed: remove.size, updated: update.size })}
        </button>
      )}
    </div>
  );
}

export function ScheduleEditor({
  groupId,
  initialRules,
  initialMeetingUrl,
  disabled,
  timezone,
  locale,
  labels,
  errors,
}: {
  groupId: string;
  initialRules: { weekday: number; startTime: string; endTime: string }[];
  initialMeetingUrl: string;
  disabled: boolean;
  timezone: string;
  locale: Locale;
  labels: Labels;
  errors: Errors;
}) {
  const [rows, setRows] = useState<Row[]>(() => initialRules.map((rule, key) => ({ ...rule, key })));
  const [nextKey, setNextKey] = useState(initialRules.length);
  const [meetingUrl, setMeetingUrl] = useState(initialMeetingUrl);
  const [applyLink, setApplyLink] = useState(false);
  const [state, preview, previewing] = useActionState(previewSchedule, undefined);
  const [previewedDraft, setPreviewedDraft] = useState<string | null>(null);

  const rulesJson = JSON.stringify(
    sortRules(rows).map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
  );
  const draft = `${rulesJson}|${meetingUrl}|${applyLink}`;
  const names = weekdayNames(locale);
  const days = names.map((name, i) => ({ name, value: (i + 1) % 7 }));
  const change = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const incomplete = rows.some((r) => !r.startTime || !r.endTime || r.endTime <= r.startTime);
  const overlapping = rulesOverlap(rows);

  return (
    <div className="space-y-4">
      <fieldset disabled={disabled} className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted">{labels.noRules}</p>}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[10rem_8rem_8rem_auto]">
              <label className="col-span-2 block sm:col-span-1">
                <span className="mb-1 block text-xs font-medium text-muted">{labels.weekday}</span>
                <select
                  value={row.weekday}
                  onChange={(event) => change(row.key, { weekday: Number(event.target.value) })}
                  className="field disabled:opacity-60"
                >
                  {days.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">{labels.start}</span>
                <input
                  type="time"
                  value={row.startTime}
                  onChange={(event) => change(row.key, { startTime: event.target.value })}
                  className="field disabled:opacity-60"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">{labels.end}</span>
                <input
                  type="time"
                  value={row.endTime}
                  onChange={(event) => change(row.key, { endTime: event.target.value })}
                  className="field disabled:opacity-60"
                />
              </label>
              <button
                type="button"
                aria-label={labels.removeRule}
                className="btn-ghost h-[46px] justify-self-start disabled:opacity-60"
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              >
                <TrashIcon width={18} height={18} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-ghost disabled:opacity-60"
          onClick={() => {
            setRows((current) => [...current, { key: nextKey, weekday: 1, startTime: "18:00", endTime: "19:30" }]);
            setNextKey((k) => k + 1);
          }}
        >
          {labels.addRule}
        </button>
        <p className="text-xs text-muted">{fmt(labels.timezoneHint, { timezone })}</p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{labels.meetingUrl}</span>
          <input
            type="url"
            value={meetingUrl}
            onChange={(event) => setMeetingUrl(event.target.value)}
            placeholder="https://…"
            maxLength={2000}
            className="field disabled:opacity-60"
          />
          <span className="mt-1 block text-xs text-muted">{labels.meetingUrlHint}</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
            checked={applyLink}
            onChange={(event) => setApplyLink(event.target.checked)}
          />
          {labels.applyLinkToFuture}
        </label>
      </fieldset>

      {overlapping && <Alert>{errors.scheduleOverlap}</Alert>}
      {!overlapping && incomplete && <Alert>{errors.scheduleRules}</Alert>}
      {state?.error && <Alert>{errors[state.error]}</Alert>}

      {!disabled && (
        <button
          type="button"
          disabled={previewing || overlapping || incomplete}
          className="btn"
          onClick={() => {
            const data = new FormData();
            data.set("groupId", groupId);
            data.set("rules", rulesJson);
            data.set("meetingUrl", meetingUrl);
            setPreviewedDraft(draft);
            startTransition(() => preview(data));
          }}
        >
          {previewing ? labels.previewing : labels.preview}
        </button>
      )}

      {state?.preview && previewedDraft === draft && !previewing && (
        // A new preview starts with fresh ticks.
        <PreviewPanel
          key={state.preview.id}
          preview={state.preview}
          groupId={groupId}
          rulesJson={rulesJson}
          meetingUrl={meetingUrl}
          applyLink={applyLink}
          locale={locale}
          labels={labels}
          errors={errors}
        />
      )}
    </div>
  );
}
