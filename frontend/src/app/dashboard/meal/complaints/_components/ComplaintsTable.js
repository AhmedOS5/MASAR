"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QueryState from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import RowMenu from "@/components/ui/RowMenu";
import usePermissions from "@/hooks/usePermissions";
import { updateComplaint } from "@/services/meal.service";
import { COMPLAINT_PRIORITY, COMPLAINT_STATUS, pick } from "@/lib/labels";
import { formatIsoDay } from "@/lib/format";
import { useToast } from "@/components/Toast/ToastProvider";
import styles from "./ComplaintsTable.module.css";

export default function ComplaintsTable({ query, page, onPageChange }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = usePermissions();

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => updateComplaint(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal"] });
      toast.success("تم تحديث حالة الشكوى.");
    },
  });

  return (
    <div className={styles.tableCard} id="complaints-table">
      <div className={styles.cardHeader}>
        {query.data?.meta?.total != null && <span className={styles.count}>{query.data.meta.total} شكاوى</span>}
        <div className={styles.titleBlock}>
          <h3 className={styles.cardTitle}>قائمة الشكاوى والتغذية الراجعة</h3>
          <span className={styles.cardSubtitle}>عرض الشكاوى حسب الحالة والأولوية والمسؤول.</span>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد شكاوى مطابقة.">
          {({ items, meta }) => (
            <>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>رقم الشكوى</th>
                    <th>نوع الشكوى</th>
                    <th>المشروع</th>
                    <th>المنطقة</th>
                    <th>قناة الاستلام</th>
                    <th>الأولوية</th>
                    <th>الحالة</th>
                    <th>المسؤول</th>
                    <th>تاريخ الاستلام</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const pr = pick(COMPLAINT_PRIORITY, item.priority);
                    const st = pick(COMPLAINT_STATUS, item.status);
                    return (
                      <tr key={item.id} className={item.priority === "sensitive" ? styles.sensitiveRow : ""}>
                        <td><span className={styles.codeBadge}>{item.code ?? item.id}</span></td>
                        <td className={styles.typeCell}>{item.type}</td>
                        <td className={styles.plainCell}>{item.project ?? "—"}</td>
                        <td className={styles.plainCell}>{item.region ?? "—"}</td>
                        <td className={styles.plainCell}>{item.channel ?? "—"}</td>
                        <td>
                          <span className={`${styles.priorityBadge} ${styles[pr.cls] || ""}`}>
                            <span className={styles.prioDot}></span>
                            {pr.label}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[st.cls] || ""}`}>{st.label}</span>
                        </td>
                        <td className={styles.ownerCell}>{item.owner?.name ?? item.owner_name ?? "—"}</td>
                        <td className={styles.dateCell}>{formatIsoDay(item.received_at ?? item.created_at)}</td>
                        <td>
                          {can("meal.manage") && (
                            <RowMenu
                              buttonClassName={styles.actionBtn}
                              items={Object.entries(COMPLAINT_STATUS)
                                .filter(([code]) => code !== item.status)
                                .map(([code, { label }]) => ({
                                  label: `تحويل إلى: ${label}`,
                                  onSelect: () => setStatus.mutate({ id: item.id, status: code }),
                                }))}
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
