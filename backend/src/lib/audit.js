// Append-only audit trail (table `audit_logs`): who did what to which entity. `handle` is the db or a transaction.
// Never put secrets (passwords, codes, tokens) in `meta`.
import { nowIso } from "./time.js";

/**
 * @param handle  knex instance or transaction
 * @param entry   { organizationId, actorId?, action, entityType, entityId, meta? }
 *                action e.g. "organization.approved" (<= 60 chars), entityType e.g. "organization" (<= 30 chars)
 */
export const writeAudit = (handle, { organizationId, actorId = null, action, entityType, entityId, meta = {} }) =>
  handle("audit_logs").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    meta: JSON.stringify(meta),
    created_at: nowIso(),
  });
