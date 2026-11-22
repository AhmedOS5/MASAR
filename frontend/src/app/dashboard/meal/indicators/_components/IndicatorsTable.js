"use client";

import React from "react";
import QueryState from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import RowMenu from "@/components/ui/RowMenu";
import usePermissions from "@/hooks/usePermissions";
import { INDICATOR_STATUS, pick } from "@/lib/labels";
import { formatNumber, timeAgo, toPercent } from "@/lib/format";
import styles from "./IndicatorsTable.module.css";

export default function IndicatorsTable({ query, page, onPageChange, onEdit }) {
  const { can } = usePermissions();
  return (
    <div className={styles.tableCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>قائمة المؤشرات</h3>
        <span className={styles.cardSubtitle}>
          عرض المؤشرات المرتبطة بالمشاريع والقيم المستهدفة والمحققة.
        </span>
      </div>

      <div className={styles.tableWrapper}>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد مؤشرات مطابقة.">
          {({ items, meta }) => (
            <>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>رمز المؤشر</th>
                    <th>اسم المؤشر</th>
                    <th>المشروع</th>
                    <th>القطاع</th>
                    <th>المستهدف</th>
                    <th>المحقق</th>
                    <th>نسبة الإنجاز</th>
                    <th>الحالة</th>
                    <th>آخر تحديث</th>
                    <th>المسؤول</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const st = pick(INDICATOR_STATUS, item.status, { label: item.status, cls: "", color: "#64748b" });
                    const percent = item.percent ?? toPercent(item.achieved, item.target);
                    return (
                      <tr key={item.id}>
                        <td><span className={styles.codeBadge}>{item.code}</span></td>
                        <td className={styles.nameCell}>{item.name}</td>
                        <td className={styles.plainCell}>{item.project ?? "—"}</td>
                        <td className={styles.plainCell}>{item.sector ?? "—"}</td>
                        <td className={styles.targetCell}>{formatNumber(item.target)}</td>
                        <td className={styles.achievedCell}>{formatNumber(item.achieved)}</td>
                        <td>
                          <div className={styles.progressCell}>
                            <span className={styles.progressLabel} style={{ color: st.color }}>{percent}%</span>
                            <div className={styles.progressTrack}>
                              <div className={styles.progressFill} style={{ width: `${percent}%`, backgroundColor: st.color }}></div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[st.cls] || ""}`}>{st.label}</span>
                        </td>
                        <td className={styles.dateCell}>{timeAgo(item.updated_at)}</td>
                        <td className={styles.ownerCell}>{item.owner?.name ?? item.owner_name ?? "—"}</td>
                        <td>
                          {can("meal.manage") && (
                            <RowMenu
                              buttonClassName={styles.actionBtn}
                              items={[{ label: "تحديث القيمة المحققة", onSelect: () => onEdit(item) }]}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: 12 }}>
                <Pagination page={meta.current_page ?? page} lastPage={meta.last_page ?? 1} onChange={onPageChange} />
              </div>
            </>
          )}
        </QueryState>
      </div>
    </div>
  );
}
