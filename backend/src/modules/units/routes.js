// Product units. The catalog is global (table `units`); each organization's choice lives in `org_units`.
// No org_units row => default: enabled iff the unit is core. Units still in development cannot be switched.
import { HttpError, notFound } from "../../lib/errors.js";
import { paramId, parse, z } from "../../lib/validate.js";
import { listOf } from "../../lib/pagination.js";
import { bool } from "../../lib/time.js";

const patchSchema = z.object({ enabled: z.boolean() });

export function unitStatus({ availability, tier, enabled, setup_required }) {
  if (availability === "in_development") return "in_development";
  const on = enabled === null || enabled === undefined ? tier === "core" : bool(enabled);
  if (!on) return "inactive";
  return bool(setup_required) ? "setup_required" : "active";
}

const toUnit = (r) => ({
  id: r.id,
  key: r.key,
  title: r.title,
  description: r.description,
  status: unitStatus(r),
  tier: r.tier,
  roles_count: r.roles_count,
  screens_count: r.screens_count,
  manager_roles: r.manager_roles,
  icon: r.icon,
  href: r.href,
});

/** All units with the organization's state applied (also used by the dashboard). */
export function unitsFor(db, organizationId, { unitId, key } = {}) {
  const qb = db("units as un")
    .leftJoin("org_units as ou", function join() {
      this.on("ou.unit_id", "un.id").andOn("ou.organization_id", db.raw("?", [organizationId]));
    })
    .select("un.*", "ou.enabled", "ou.setup_required")
    .orderBy(["un.sort_order", "un.id"]);
  if (unitId) qb.where("un.id", unitId);
  if (key) qb.where("un.key", key);
  return qb;
}

export default async function unitRoutes(app) {
  const { db } = app;

  app.get("/units", { preHandler: app.guard({ permission: "units.view" }) }, async (request) =>
    listOf((await unitsFor(db, request.auth.organizationId)).map(toUnit)),
  );

  app.patch("/units/:id", { preHandler: app.guard({ permission: "units.manage" }) }, async (request) => {
    const id = paramId(request.params.id);
    const { enabled } = parse(patchSchema, request.body);
    const organizationId = request.auth.organizationId;

    const [unit] = await unitsFor(db, organizationId, { unitId: id });
    if (!unit) throw notFound("الوحدة غير موجودة.");
    if (unit.availability === "in_development") throw new HttpError(422, "الوحدة قيد التطوير ولا يمكن تفعيلها بعد.");

    await db("org_units")
      .insert({ organization_id: organizationId, unit_id: id, enabled })
      .onConflict(["organization_id", "unit_id"])
      .merge(["enabled"]);
    const [updated] = await unitsFor(db, organizationId, { unitId: id });
    return { data: toUnit(updated) };
  });
}
