"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ListChecks } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import { getMealReportInsights } from "@/services/meal.service";
import { levelColor } from "@/lib/labels";
import styles from "./ReportsSidePanel.module.css";

/** GET /meal/reports/insights -> { summary:[{text,level}], actions:[{text,level}] } */
export default function ReportsSidePanel({ onApply }) {
  const query = useQuery({ queryKey: ["meal", "reports", "insights"], queryFn: getMealReportInsights });

  const List = ({ items, empty }) => (
    <div className={styles.list}>
      {items.length === 0 && <span className={styles.itemText}>{empty}</span>}
      {items.map((item) => (
        <div key={item.text} className={styles.item}>
          <span className={styles.dot} style={{ backgroundColor: levelColor(item.level) }}></span>
          <span className={styles.itemText}>{item.text}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className={styles.sidePanel}>
      <QueryState query={query} rows={5} block>
        {(data) => (
          <>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <BarChart3 size={16} className={styles.headerIcon} />
                <h4 className={styles.cardTitle}>ملخص التقارير</h4>
              </div>
              <List items={data?.summary ?? []} empty="لا يوجد ملخص بعد." />
              <button type="button" className={`${styles.panelBtn} ${styles.btnBlue}`} onClick={() => onApply({ status: "in_review" })}>
                عرض الملخص
              </button>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <ListChecks size={16} className={styles.headerIcon} />
                <h4 className={styles.cardTitle}>تقارير تحتاج إجراء</h4>
              </div>
              <List items={data?.actions ?? []} empty="لا توجد تقارير تحتاج إجراء." />
              <button type="button" className={`${styles.panelBtn} ${styles.btnAmber}`} onClick={() => onApply({ status: "needs_edit" })}>
                مراجعة المطلوب
              </button>
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
