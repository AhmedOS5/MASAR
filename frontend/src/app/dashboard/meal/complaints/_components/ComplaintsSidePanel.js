"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bell, ShieldAlert } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import { getComplaintInsights } from "@/services/meal.service";
import { levelColor } from "@/lib/labels";
import styles from "./ComplaintsSidePanel.module.css";

/**
 * GET /meal/complaints/insights ->
 * { metrics:[{label,value,level}], alerts:[{text,level}] }
 */
export default function ComplaintsSidePanel({ onApply }) {
  const query = useQuery({ queryKey: ["meal", "complaints", "insights"], queryFn: getComplaintInsights });

  const scrollToTable = () =>
    document.getElementById("complaints-table")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className={styles.sidePanel}>
      <QueryState query={query} rows={5} block>
        {(data) => {
          const metrics = data?.metrics ?? [];
          const alerts = data?.alerts ?? [];
          return (
            <>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <BarChart3 size={16} className={styles.headerIcon} />
                  <h4 className={styles.cardTitle}>مؤشرات المساءلة</h4>
                </div>

                <div className={styles.metricsList}>
                  {metrics.length === 0 && <span className={styles.metricLabel}>لا توجد مؤشرات بعد.</span>}
                  {metrics.map((m) => (
                    <div key={m.label} className={styles.metricRow}>
                      <span className={styles.metricLabel}>{m.label}</span>
                      <span className={styles.metricValue} style={{ color: levelColor(m.level) }}>
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>

                <button type="button" className={`${styles.panelBtn} ${styles.btnBlue}`} onClick={scrollToTable}>
                  عرض التفاصيل
                </button>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Bell size={16} className={styles.headerIcon} />
                  <h4 className={styles.cardTitle}>تنبيهات الشكاوى</h4>
                  <span className={styles.alertsBadge}>{alerts.length} تنبيهات</span>
                </div>

                <div className={styles.alertsList}>
                  {alerts.length === 0 && <span className={styles.alertText}>لا توجد تنبيهات.</span>}
                  {alerts.map((a) => (
                    <div key={a.text} className={styles.alertItem}>
                      <span className={styles.dot} style={{ backgroundColor: levelColor(a.level) }}></span>
                      <span className={styles.alertText}>{a.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className={`${styles.panelBtn} ${styles.btnRed}`}
                  onClick={() => {
                    onApply({ status: "sensitive" });
                    scrollToTable();
                  }}
                >
                  مراجعة التنبيهات
                </button>
              </div>
            </>
          );
        }}
      </QueryState>

      <div className={styles.privacyCard}>
        <ShieldAlert size={17} className={styles.privacyIcon} />
        <div className={styles.privacyBody}>
          <h5 className={styles.privacyTitle}>تنبيه الخصوصية</h5>
          <p className={styles.privacyText}>
            قد تحتوي بعض الشكاوى على بيانات حساسة. يجب تقييد الوصول إليها حسب الصلاحيات وعدم مشاركة
            التفاصيل خارج النظام.
          </p>
        </div>
      </div>
    </div>
  );
}
