"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import QueryState from "@/components/ui/QueryState";
import { listFieldRecords } from "@/services/meal.service";
import { FIELD_RECORD_STATUS } from "@/lib/labels";
import { formatIsoDay } from "@/lib/format";
import styles from "./FieldDataRecent.module.css";

export default function FieldDataRecent({ showAll, onToggle }) {
  const perPage = showAll ? 50 : 3;
  const query = useQuery({
    queryKey: ["meal", "field-records", perPage],
    queryFn: () => listFieldRecords({ per_page: perPage }),
  });

  return (
    <div className={styles.recentBlock} id="field-recent">
      <div className={styles.recentHead}>
        <button
          type="button"
          className={styles.headLink}
          onClick={onToggle}
          style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
        >
          {showAll ? "عرض الأحدث فقط" : "عرض كل السجلات"}
        </button>
        <div className={styles.headTitleBlock}>
          <h3 className={styles.recentTitle}>آخر السجلات الميدانية</h3>
        </div>
      </div>

      <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد سجلات ميدانية بعد.">
        {({ items }) => (
          <div className={styles.cardsGrid}>
            {items.map((record) => {
              const st = FIELD_RECORD_STATUS[record.status] ?? { label: record.status, cls: "" };
              return (
                <div key={record.id} className={styles.recordCard}>
                  <div className={styles.cardTop}>
                    <span className={styles.recordName}>{record.title || record.activity_type}</span>
                    <span className={`${styles.statusBadge} ${styles[st.cls] || ""}`}>{st.label}</span>
                  </div>
                  <span className={styles.recordDate}>{formatIsoDay(record.activity_date ?? record.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}
