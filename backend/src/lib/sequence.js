// Per-organization atomic counters for human-readable codes: REQ-001, TSK-014, FCRM-900 ...

/**
 * Atomically increment and return the next value for (organization, key).
 * Pass a transaction as `db` so the code is rolled back together with the row that uses it.
 * `start` only matters the first time the counter is created (e.g. FCRM codes begin at 900).
 */
export async function nextValue(db, organizationId, key, { start = 1 } = {}) {
  await db("counters")
    .insert({ organization_id: organizationId, key, value: start - 1 })
    .onConflict(["organization_id", "key"])
    .ignore();
  const [row] = await db("counters")
    .where({ organization_id: organizationId, key })
    .update({ value: db.raw("value + 1") }, ["value"]);
  return typeof row === "object" ? row.value : row;
}

export async function nextCode(db, organizationId, key, prefix, { pad = 3, start = 1 } = {}) {
  const n = await nextValue(db, organizationId, key, { start });
  return `${prefix}-${String(n).padStart(pad, "0")}`;
}
