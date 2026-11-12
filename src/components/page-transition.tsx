"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

// A short crossfade when the page changes (the browser's View Transitions API, through React's <ViewTransition>).
// Keyed by the address: a new address is a new page, and only then does anything animate. Only the content is
// wrapped; the header and the navigation stay where they are. Browsers without the API just swap, as before.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} default="none" enter="page-in" exit="page-out">
      {children}
    </ViewTransition>
  );
}
