import { logout } from "@/app/actions";

// A way out of a screen that nothing else can leave (a forced password change, accepting the privacy notice),
// for someone who signed in to the wrong account.
export function NotYou({ label }: { label: string }) {
  return (
    <form action={logout} className="mt-6 text-center">
      <button type="submit" className="inline-flex min-h-11 items-center px-3 text-sm text-accent hover:underline">
        {label}
      </button>
    </form>
  );
}
