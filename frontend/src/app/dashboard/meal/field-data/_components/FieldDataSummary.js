"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { projectOptions, useWorkProjects } from "@/features/projects/ProjectField";
import { listIndicators } from "@/services/meal.service";
import { STEPS } from "@/features/meal/useFieldRecordForm";
import { toPercent } from "@/lib/format";
import styles from "./FieldDataSummary.module.css";

// Informational copy (not data): what happens to a submitted record.
const USAGE_STEPS = [
  "تحديث قيمة المؤشر",
  "إضافة المستفيدين إلى الإحصائيات",
  "حفظ المرفقات كأدلة",
  "إتاحة السجل للتقارير",
];

/** Summary is derived live from the form values and the selected indicator. */
export default function FieldDataSummary({ form }) {
  const { values, files, step } = form;
  const projects = useWorkProjects();
  const indicators = useQuery({
    queryKey: ["meal", "indicators", "picker", values.project_id],
    queryFn: () => listIndicators({ per_page: 100, project_id: values.project_id }),
    enabled: Boolean(values.indicator_id) && Boolean(values.project_id),
  });
  const indicator = (indicators.data?.items ?? []).find((i) => String(i.id) === String(values.indicator_id));
  const percent = indicator && values.achieved_value !== "" ? toPercent(values.achieved_value, indicator.target) : null;

  const fields = [
    { label: "المشروع", value: projectOptions(projects.data).find((p) => String(p.value) === String(values.project_id))?.label },
    { label: "النشاط", value: values.activity_type },
    { label: "الموقع", value: [values.region, values.location].filter(Boolean).join(" — ") },
    { label: "المؤشر", value: indicator?.code, isCode: true },
    { label: "القيمة المحققة", value: values.achieved_value },
    { label: "إجمالي المستفيدين", value: values.total_beneficiaries },
    { label: "المرفقات", value: files.length ? `${files.length} ملف` : "" },
  ];
  const formProgress = Math.round(((step - 1) / STEPS.length) * 100);

  return (
    <div className={styles.summaryPanel}>
      <div className={styles.card}>
        <div className={styles.summaryHeader}>
          <h4 className={styles.summaryTitle}>ملخص السجل</h4>
          <span className={styles.statusPill}>
            <span className={styles.statusDot}></span>
            مسودة
          </span>
        </div>

        <div className={styles.cardPad}>
          <div className={styles.summaryList}>
            {fields.map((row) => (
              <div key={row.label} className={styles.summaryRow}>
                <span className={styles.rowLabel}>{row.label}</span>
                {row.isCode && row.value ? (
                  <span className={styles.codeBadge}>{row.value}</span>
                ) : (
                  <span className={styles.rowValue}>{row.value || "—"}</span>
                )}
              </div>
            ))}
          </div>

          <div className={styles.progressBlock}>
            <div className={styles.summaryRow} style={{ borderBottom: "none" }}>
              <span className={styles.rowLabel}>نسبة الإنجاز</span>
              <span className={`${styles.rowValue} ${styles.percentValue}`}>{percent == null ? "—" : `${percent}%`}</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${percent ?? 0}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${styles.card} ${styles.cardPad}`}>
        <h4 className={styles.usageTitle}>كيف سيتم استخدام هذا السجل؟</h4>
        <div className={styles.usageList}>
          {USAGE_STEPS.map((text, idx) => (
            <div key={text} className={styles.usageItem}>
              <span className={styles.usageNum}>{idx + 1}</span>
              <span className={styles.usageText}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`${styles.card} ${styles.cardPad}`}>
        <div className={styles.progressHead}>
          <span className={styles.progressCardTitle}>تقدم الاستمارة</span>
          <span className={styles.progressPercent}>{formProgress}%</span>
        </div>
        <span className={styles.progressStep}>الخطوة {step} من {STEPS.length}</span>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${formProgress}%` }}></div>
        </div>
      </div>
    </div>
  );
}
