// MEAL routes: the caller needs the permission AND the organization must have the MEAL unit switched on.
import { forbidden } from "../../lib/errors.js";
import { unitsFor, unitStatus } from "../units/routes.js";

export function mealGuard(app, permission) {
  const base = app.guard({ permission });
  return async function guard(request) {
    await base(request);
    const [unit] = await unitsFor(app.db, request.auth.organizationId, { key: "meal" });
    if (!unit || !["active", "setup_required"].includes(unitStatus(unit))) {
      throw forbidden("وحدة المتابعة والتقييم غير مفعّلة لمؤسستك.");
    }
  };
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (fromIso, to = Date.now()) => Math.floor((to - new Date(fromIso).getTime()) / 86_400_000);
