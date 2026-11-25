"use client";

import React from "react";
import Link from "next/link";
import QueryState from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import ui from "@/components/ui/ui.module.css";
import { TASK_STATUS, PRIORITY, badgeTone, pick } from "@/lib/labels";
import { formatDate, initialOf } from "@/lib/format";

export function TasksTable({ query, page, onPageChange }) {
  return (
    <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد مهام مطابقة.">
      {({ items, meta }) => {
        const total = meta.total ?? items.length;
        return (
          <div className={ui.tableCard}>
            <div className={ui.tableSummary}>تم العثور على {total} مهمة</div>

            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">الرقم</th>
                    <th scope="col">العنوان</th>
                    <th scope="col">النوع</th>
                    <th scope="col">المسؤول</th>
                    <th scope="col">القسم</th>
                    <th scope="col">الأولوية</th>
                    <th scope="col">الحالة</th>
                    <th scope="col">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((task) => {
                    const st = pick(TASK_STATUS, task.status);
                    const pr = pick(PRIORITY, task.priority);
                    const assignee = task.assignee?.name ?? task.assignee_name ?? "—";
                    return (
                      <tr key={task.id}>
                        <td className={ui.mono}>
                          <Link href={`/dashboard/tasks/${task.id}`} className={ui.tableLink}>
                            {task.code ?? task.id}
                          </Link>
                        </td>
                        <td>
                          <Link href={`/dashboard/tasks/${task.id}`} className={ui.tableLink}>
                            {task.title}
                          </Link>
                        </td>
                        <td>{task.type ?? "—"}</td>
                        <td>
                          <span className={ui.inlineCell}>
                            <span className={ui.avatarSm} aria-hidden="true">{initialOf(assignee)}</span>
                            <span>{assignee}</span>
                          </span>
                        </td>
                        <td>{task.department ?? "—"}</td>
                        <td>
                          <span className={`${ui.badge} ${ui[`badge_${badgeTone(pr.tone)}`]}`}>{pr.label}</span>
                        </td>
                        <td>
                          <span className={`${ui.badge} ${ui[`badge_${badgeTone(st.tone)}`]}`}>{st.label}</span>
                        </td>
                        <td className={ui.mono}>{formatDate(task.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={ui.tableFooter}>
              <span>
                عرض {items.length} من {total}
              </span>
              <Pagination page={meta.current_page ?? page} lastPage={meta.last_page ?? 1} onChange={onPageChange} />
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
