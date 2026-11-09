import "server-only";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_ROUNDS = 10;
// Compared against when the email doesn't exist, so the response takes as long either way.
const DUMMY_HASH = "$2b$10$DTFNzgT3xfNRXquk3BGo2ekPutEu01r6BEYR2qisvrlWi588WdZeK";

export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(200);

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string | null | undefined) {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

// One-time links carry the raw token; the database stores only its hash (see scripts/reset-link.ts).
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
