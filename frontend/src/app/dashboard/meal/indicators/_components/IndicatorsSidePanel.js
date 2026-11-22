"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import { getIndicatorInsights } from "@/services/meal.service";
import { levelColor } from "@/lib/labels";
import usePermissions from "@/hooks/usePermissions";
import styles from "./IndicatorsSidePanel.module.css";

/**
 * GET /meal/indicators/insights ->
 * { insights:[{text,level}], updates:[{indicator_id?, code?, text}] }
 */
export default function IndicatorsSidePanel({ onApply, onEdit }) {
  const { can } = usePermissions();
  const query = useQuery({ queryKey: ["meal", "indicators", "insights"], queryFn: getIndicatorInsights });

  return (
    <div className={styles.sidePanel}>
      <QueryState query={query} rows={5} block>
        {(data) => {
          const insights = data?.insights ?? [];
          const updates = data?.updates ?? [];
          return (
            <>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Lightbulb size={16} className={styles.headerIcon} />
                  <h4 className={styles.cardTitle}>رؤى سريعة</h4>
                </div>

                <ul className={styles.insightsList}>
                  {insights.length === 0 && <li className={styles.insightText}>لا توجد رؤى بعد.</li>}
                  {insights.map((item) => (
                    <li key={item.text} className={styles.insightItem}>
                      <span className={styles.dot} style={{ backgroundColor: levelColor(item.level) }}></span>
                      <span className={styles.insightText}>{item.text}</span>
                    </li>
                  ))}
                </ul>

                <button type="button" className={`${styles.panelBtn} ${styles.btnBlue}`} onClick={() => onApply({ status: "delayed" })}>
                  عرض التحليل
                </button>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h4 className={styles.cardTitle}>تحديثات مطلوبة</h4>
                </div>

                <div className={styles.updatesList}>
                  {updates.length === 0 && <span className={styles.updateText}>لا توجد تحديثات مطلوبة.</span>}
                  {updates.map((item, idx) => (
                    <div key={item.indicator_id ?? idx} className={styles.updateItem}>
                      <div className={styles.updateInfo}>
                        {item.code && <span className={styles.updateCode}>{item.code}</span>}
                        <span className={styles.updateText}>{item.text}</span>
                      </div>
                      {item.indicator_id && can("meal.manage") && (
                        <button
                          type="button"
                          className={styles.updateLink}
                          onClick={() => onEdit({ id: item.indicator_id, code: item.code })}
                        >
                          تحديث
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button type="button" className={`${styles.panelBtn} ${styles.btnAmber}`} onClick={() => onApply({ status: "needs_follow" })}>
                  مراجعة المطلوب
                </button>
              </div>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
