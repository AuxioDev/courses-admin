import type { Dictionary } from "@/i18n/dictionaries/en";
import type { FormState } from "@/app/actions";

export function Feedback({
  state,
  errors,
  ok,
}: {
  state: FormState;
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  if (state?.error) {
    return (
      <p role="alert" className="mt-2 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
        {errors[state.error]}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="mt-2 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">
        {ok[state.ok]}
      </p>
    );
  }
  return null;
}
