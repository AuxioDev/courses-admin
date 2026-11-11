"use client";

import { ErrorView } from "@/components/error-view";

// Inside the layout: an error on one page leaves the navigation in place.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
