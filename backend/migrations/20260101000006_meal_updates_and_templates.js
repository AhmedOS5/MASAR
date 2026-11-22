// MEAL support data:
//  * indicator_updates — every change of an indicator's achieved value (manual edit or field-record submission).
//    It is the audit trail AND what lets /meal/charts show "actual as of the end of quarter Q".
//  * built-in report templates (organization_id NULL = visible to every organization).
import { nowDefault, tenant, userRef } from "../src/db/schema-helpers.js";

const TEMPLATES = [
  { name: "قالب الأداء الربعي", type: "تقرير ربعي", description: "ملخص أداء المؤشرات والمستفيدين والشكاوى خلال الربع." },
  { name: "قالب تقدم المشروع", type: "تقرير متابعة", description: "حالة المؤشرات والأنشطة الميدانية لمشروع محدد." },
  { name: "قالب الشكاوى والملاحظات", type: "تقرير متابعة", description: "تحليل الشكاوى المستلمة وحالات المعالجة." },
];

export async function up(knex) {
  await knex.schema.createTable("indicator_updates", (t) => {
    t.increments("id");
    tenant(t);
    t.integer("indicator_id").unsigned().notNullable().references("id").inTable("indicators").onDelete("CASCADE");
    t.decimal("delta", 14, 2).notNullable();
    t.decimal("value_after", 14, 2).notNullable();
    t.string("source", 20).notNullable(); // manual | field_record
    t.integer("field_record_id").unsigned().references("id").inTable("field_records").onDelete("SET NULL");
    userRef(t, "created_by");
    t.timestamp("created_at").notNullable().defaultTo(nowDefault(knex));
    t.index(["indicator_id", "id"]);
    t.index(["organization_id", "created_at"]);
  });
  await knex("report_templates").insert(TEMPLATES);
}

export async function down(knex) {
  await knex("report_templates").whereNull("organization_id").whereIn("name", TEMPLATES.map((t) => t.name)).del();
  await knex.schema.dropTableIfExists("indicator_updates");
}
