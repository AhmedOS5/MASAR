// Contract: lists are `{ data: [...], meta: { total, current_page, last_page, ...extras } }`.
// Query params: `page`, `per_page`. A filter value of "all" means "no filter" (the UI normally omits it).

export const DEFAULT_PER_PAGE = 10;
export const MAX_PER_PAGE = 100;

/** Clamp page / per_page from the query string. */
export function pageParams(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(query.per_page, 10) || DEFAULT_PER_PAGE));
  return { page, perPage };
}

/** True when a filter was actually supplied (not empty, not "all"). */
export const hasFilter = (v) => v !== undefined && v !== null && v !== "" && v !== "all";

/** Escape LIKE wildcards so user input is matched literally. Use with `escape '\\'`. */
export const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Apply a case-insensitive "contains" search over several columns.
 * (LIKE is case-insensitive for ASCII on SQLite; for PostgreSQL we lower() both sides.)
 */
export function applySearch(qb, search, columns) {
  if (!hasFilter(search) || !columns.length) return qb;
  const needle = `%${likeEscape(String(search).trim().toLowerCase())}%`;
  return qb.where((w) => {
    for (const col of columns) w.orWhereRaw(`lower(cast(?? as text)) like ? escape '\\'`, [col, needle]);
  });
}

/**
 * Run a paginated query.
 * @param qb      Knex query builder already filtered/sorted (no select list needed for the count).
 * @param params  { page, perPage } from pageParams()
 * @param mapRows async|sync (rows) => rows  — shape rows for the API (may batch-load relations)
 * @param extraMeta object merged into `meta` (e.g. { status_counts })
 */
export async function paginate(qb, { page, perPage }, mapRows = (r) => r, extraMeta = {}) {
  const countRow = await qb.clone().clearSelect().clearOrder().count({ total: "*" }).first();
  const total = Number(countRow?.total ?? 0);
  const rows = await qb.clone().limit(perPage).offset((page - 1) * perPage);
  return {
    data: await mapRows(rows),
    meta: {
      total,
      current_page: page,
      per_page: perPage,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      ...extraMeta,
    },
  };
}

/** `{ data, meta: { total } }` for unpaginated lists. */
export const listOf = (data, meta = {}) => ({ data, meta: { total: data.length, ...meta } });
