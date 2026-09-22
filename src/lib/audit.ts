import type { AuditEntry } from "../types";
import { uid } from "./helpers";
import { currentActor } from "./actor";

const MAX = 500;

/**
 * Push an audit entry. Never throws — auditing must not break the action.
 * Returns a new array (prepend style, newest first).
 */
export function logAudit(
  entries: AuditEntry[],
  action: AuditEntry["action"],
  entity: string,
  ref: string,
  detail: string,
): AuditEntry[] {
  const e: AuditEntry = {
    id: uid("aud"),
    at: new Date().toISOString(),
    actor: currentActor(),
    action,
    entity,
    ref,
    detail,
  };
  return [e, ...entries].slice(0, MAX);
}

export function auditSummary(e: AuditEntry): string {
  const verb: Record<AuditEntry["action"], string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
    restore: "restored",
    login: "signed in",
    sale: "recorded a sale",
    payment: "recorded a payment",
    purge: "permanently deleted",
  };
  return `${e.actor} ${verb[e.action]} ${e.entity.toLowerCase()} ${e.ref}${e.detail ? ` — ${e.detail}` : ""}`;
}
