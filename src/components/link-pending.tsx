"use client";

import { useLinkStatus } from "next/link";

// Put inside a <Link>: shows a small dot on the link while the next page is loading.
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className="link-pending" data-pending={pending ? "" : undefined} />;
}
