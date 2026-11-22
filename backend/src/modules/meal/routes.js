// MEAL (monitoring, evaluation, accountability, learning) — every route requires meal.view / meal.manage AND the
// MEAL unit being switched on for the organization (see ./guard.js).
import overviewRoutes from "./overview.js";
import complaintRoutes from "./complaints.js";
import indicatorRoutes from "./indicators.js";
import mealReportRoutes from "./reports.js";
import fieldRecordRoutes from "./field-records.js";

export default async function mealRoutes(app) {
  await app.register(overviewRoutes);
  await app.register(complaintRoutes);
  await app.register(indicatorRoutes);
  await app.register(mealReportRoutes);
  await app.register(fieldRecordRoutes);
}
