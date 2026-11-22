"use client";

import React from "react";
import Link from "next/link";
import QueryState from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import { TASK_STATUS, PRIORITY, pick } from "@/lib/labels";
import { avatarColors, formatDate, initialOf } from "@/lib/format";
import styles from "../tasks.module.css";

export function TasksTable({ query, page, onPageChange }) {
  return (
    <div className={styles.tableCard}>
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد مهام مطابقة.">
        {({ items, meta }) => {
          const total = meta.total ?? items.length;
          return (
            <>
              <div className={styles.tableSummary}>تم العثور على {total} مهمة</div>

              <div className={styles.responsiveTable}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الحالة</th>
                      <th>الأولوية</th>
                      <th>القسم</th>
                      <th>المسؤول</th>
                      <th>النوع</th>
                      <th>العنوان</th>
                      <th>الرقم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((task) => {
                      const st = pick(TASK_STATUS, task.status);
                      const pr = pick(PRIORITY, task.priority);
                      const assignee = task.assignee?.name ?? task.assignee_name ?? "—";
                      return (
                        <tr key={task.id}>
                          <td className={styles.dateCell}>{formatDate(task.created_at)}</td>
                          <td>
                            <span className={`${styles.badge} ${styles[`status_${st.tone}`] || ""}`}>{st.label}</span>
                          </td>
                          <td>
                            <span className={`${styles.badge} ${styles[`prio_${pr.tone}`] || ""}`}>{pr.label}</span>
                          </td>
                          <td className={styles.deptCell}>{task.department ?? "—"}</td>
                          <td>
                            <div className={styles.assigneeBox}>
                              <span className={styles.assigneeName}>{assignee}</span>
                              <div className={styles.avatar} style={avatarColors(assignee)}>
                                {initialOf(assignee)}
                              </div>
                            </div>
                          </td>
                          <td className={styles.typeCell}>{task.type ?? "—"}</td>
                          <td className={styles.titleCell}>
                            <Link href={`/dashboard/tasks/${task.id}`} className={styles.tableLink}>
                              {task.title}
                            </Link>
                          </td>
                          <td className={styles.idCell}>
                            <Link href={`/dashboard/tasks/${task.id}`} className={styles.tableLink}>
                              {task.code ?? task.id}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={styles.footerRow}>
                <Pagination
                  page={meta.current_page ?? page}
                  lastPage={meta.last_page ?? 1}
                  onChange={onPageChange}
                  classes={{ wrap: styles.pagination, btn: styles.pageBtn, active: styles.activePage }}
                />
                <div className={styles.viewCount}>
                  عرض {items.length} من {total}
                </div>
              </div>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
