// The public website cannot change the shared schema, so a request for a trial lesson travels at the start of the
// application's note. This must match TRIAL_NOTE in the website's src/lib/apply.ts.
export const TRIAL_NOTE = "[Trial lesson requested]";

export function wantsTrial(note: string | null | undefined) {
  return !!note && note.startsWith(TRIAL_NOTE);
}

// The note without the marker, for showing next to the badge.
export function noteWithoutTrial(note: string | null | undefined) {
  if (!note) return "";
  return wantsTrial(note) ? note.slice(TRIAL_NOTE.length).trim() : note;
}
