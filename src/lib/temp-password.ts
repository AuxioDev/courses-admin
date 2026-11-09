import "server-only";
import { randomBytes } from "node:crypto";

const WORDS = ["kite", "moss", "lamp", "reef", "fern", "dune", "mint", "opal", "pine", "wave", "jade", "bolt"];

// Easy to read aloud or copy by hand. Only good for one login: the person must
// choose their own password straight after.
export function tempPassword() {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${digits}-${pick()}`;
}
