// How an indicator's status is derived and how its achieved value changes (with an audit row each time).
import { nowIso } from "../../lib/time.js";

// % of target reached  →  status. A new indicator with nothing reported yet is "needs follow-up".
export const ON_TRACK_FROM = 70;
export const NEEDS_FOLLOW_FROM = 40;

export function indicatorStatus(target, achieved) {
  const t = Number(target);
  const a = Number(achieved);
  if (t > 0 && a >= t) return "achieved";
  if (!(a > 0)) return "needs_follow";
  const pct = t > 0 ? (a / t) * 100 : 0;
  if (pct >= ON_TRACK_FROM) return "on_track";
  if (pct >= NEEDS_FOLLOW_FROM) return "needs_follow";
  return "delayed";
}

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** 0–100 with one decimal, capped at 100. */
export const progressPercent = (target, achieved) => (Number(target) > 0 ? Math.round(Math.min(Number(achieved) / Number(target), 1) * 1000) / 10 : 0);

/**
 * Change an indicator's achieved value inside a transaction and write the audit row.
 * Pass `set` (absolute value) or `add` (increment, applied atomically so concurrent submissions both count).
 */
export async function changeIndicator(trx, { organizationId, indicatorId, set, add, source, fieldRecordId = null, userId = null }) {
  const now = nowIso();
  const where = { id: indicatorId, organization_id: organizationId };
  let delta;
  if (add !== undefined) {
    await trx("indicators").where(where).update({ achieved: trx.raw("achieved + ?", [add]), updated_at: now });
    delta = add;
  } else {
    const before = await trx("indicators").where(where).first("achieved");
    delta = round2(set - Number(before.achieved));
    await trx("indicators").where(where).update({ achieved: set, updated_at: now });
  }
  const row = await trx("indicators").where(where).first("target", "achieved");
  const achieved = round2(row.achieved);
  await trx("indicators").where(where).update({ status: indicatorStatus(row.target, achieved) });
  await trx("indicator_updates").insert({
    organization_id: organizationId,
    indicator_id: indicatorId,
    delta: round2(delta),
    value_after: achieved,
    source,
    field_record_id: fieldRecordId,
    created_by: userId,
    created_at: now,
  });
}
