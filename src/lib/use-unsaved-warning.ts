"use client";

import { useEffect } from "react";

// While `dirty` is true the browser asks before the tab is closed, reloaded or navigated away from.
// (Links inside the app are not intercepted: Next's router has no hook for that.)
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
}
