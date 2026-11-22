"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QueryState from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import RowMenu from "@/components/ui/RowMenu";
import usePermissions from "@/hooks/usePermissions";
import { mealReportDownloadUrl, updateMealReport } from "@/services/meal.service";
import { MEAL_REPORT_STATUS, pick } from "@/lib/labels";
import { avatarColors, initialOf, timeAgo } from "@/lib/format";
import { useToast } from "@/components/Toast/ToastProvider";
import styles from "./ReportsTable.module.css";

export default function ReportsTable({ query, page, onPageChange }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = usePermissions();

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => updateMealReport(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal"] });
      toast.success("تم تحديث حالة التقرير.");
    },
  });

  return (
    <div className={styles.tableCard}>
      <div className={styles.cardHeader}>
        {query.data?.meta?.total != null && <span className={styles.count}>{query.data.meta.total} تقرير</span>}
        <div className={styles.titleBlock}>
          <h3 className={styles.cardTitle}>قائمة التقارير</h3>
          <span className={styles.cardSubtitle}>عرض التقارير حسب نوع المشروع، الحالة، والمسؤول.</span>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد تقارير مطابقة.">
          {({ items, meta }) => (
            <>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>عنوان التقرير</th>
                    <th>نوع التقرير</th>
                    <th>المشروع</th>
                    <th>الفترة</th>
                    <th>الحالة</th>
                    <th>المسؤول</th>
                    <th>آخر تحديث</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const st = pick(MEAL_REPORT_STATUS, item.status);
                    const owner = item.owner?.name ?? item.owner_name ?? "—";
                    return (
                      <tr key={item.id}>
                        <td className={styles.titleCell}>{item.title}</td>
                        <td className={styles.plainCell}>{item.type ?? "—"}</td>
                        <td className={styles.plainCell}>{item.project ?? "—"}</td>
                        <td className={styles.plainCell}>{item.period ?? "—"}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[st.cls] || ""}`}>{st.label}</span>
                        </td>
                        <td>
                          <div className={styles.ownerCell}>
                            <span className={styles.avatar} style={avatarColors(owner)}>{initialOf(owner)}</span>
                            <span className={styles.ownerName}>{owner}</span>
                          </div>
                        </td>
                        <td className={styles.dateCell}>{timeAgo(item.updated_at)}</td>
                        <td>
                          <RowMenu
                            buttonClassName={styles.actionBtn}
                            items={[
                              ...(can("meal.manage") ? Object.entries(MEAL_REPORT_STATUS) : [])
                                .filter(([code]) => code !== item.status)
                                .map(([code, { label }]) => ({
                                  label: `تحويل إلى: ${label}`,
                                  onSelect: () => setStatus.mutate({ id: item.id, status: code }),
                                })),
                              { label: "تحميل PDF", href: mealReportDownloadUrl(item.id) },
                            ]}
                          />
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
