"use client";

import { useEffect } from "react";

const KEY = "admin:theme";

// Reads a theme stored in this browser ("light" or "dark"; anything else means follow the device).
const BOOT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

// Mounted once in the root layout.
// - On the server the script runs while the page is parsed, before the first paint, so a dark choice never flashes light.
// - On the client React must not "render" a script (it would warn and not run it), so there it is marked as plain data;
//   the effect below applies the theme instead. It matters when the language changes: that re-renders the root layout
//   and the <html> element comes back without the attribute.
export function ThemeBoot() {
  useEffect(() => {
    try {
      const value = localStorage.getItem(KEY);
      if (value === "light" || value === "dark") document.documentElement.setAttribute("data-theme", value);
      else document.documentElement.removeAttribute("data-theme");
    } catch {}
  }, []);
  return (
    <script
      suppressHydrationWarning
      type={typeof window === "undefined" ? undefined : "application/json"}
      dangerouslySetInnerHTML={{ __html: BOOT }}
    />
  );
}
