"use client";

import { useRef } from "react";

// Two boxes (dates, or times) where the second must be later than the first. As soon as it is not, the second one
// carries the browser's own validation message, so the form says so before anything is sent. Spread `start` and `end`
// onto the two inputs. Works for "2026-11-13" and "18:00" alike, since both sort as text.
export function useEndAfterStart(message: string) {
  const startBox = useRef<HTMLInputElement>(null);
  const endBox = useRef<HTMLInputElement>(null);
  const check = () => {
    const a = startBox.current;
    const b = endBox.current;
    if (a && b) b.setCustomValidity(a.value && b.value && b.value <= a.value ? message : "");
  };
  return { start: { ref: startBox, onChange: check }, end: { ref: endBox, onChange: check } };
}
