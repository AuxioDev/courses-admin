import { notFound } from "next/navigation";

// Nothing to validate: this route only ever answers 404.
export const instant = false;

// Unknown addresses get the translated not-found page instead of Next's default.
export default function CatchAll() {
  notFound();
}
