import "server-only";
import { db } from "./db";

// What an admin did to someone's account or to a school record: who, what, to whom, when.
// Never put a password, a token or a message body in `detail`.
export type AuditAction =
  | "user.create"
  | "user.update"
  | "user.temp_password"
  | "user.reset_link"
  | "user.deactivate"
  | "user.reactivate"
  | "user.deletion_approved"
  | "application.approve"
  | "application.contacted"
  | "application.reject"
  | "term.lock"
  | "term.unlock";

export async function audit(
  actorId: string,
  action: AuditAction,
  targetId?: string | null,
  detail?: Record<string, string | number | boolean | null>,
) {
  await db.adminAuditLog.create({ data: { actorId, action, targetId: targetId ?? null, detail } });
}
