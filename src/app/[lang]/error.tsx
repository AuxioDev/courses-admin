"use client";

import { ErrorView } from "@/components/error-view";

// The last resort, above the app's layout: nothing else is on screen.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} fullScreen />;
}
