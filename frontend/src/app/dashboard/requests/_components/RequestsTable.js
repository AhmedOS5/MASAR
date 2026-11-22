"use client";

import React from "react";
import Link from "next/link";
import QueryState from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import { REQUEST_STATUS, PRIORITY, pick } from "@/lib/labels";
import { avatarColors, formatDate, initialOf } from "@/lib/format";
import styles from "./RequestsTable.module.css";

const statusClass = (tone) => styles[`status_${tone}`] || styles.status_draft;
const prioClass = (tone) => styles[`prio_${tone}`] || styles.prio_low;

export default function RequestsTable({ query, page, onPageChange, perPage }) {
  return (
    <div className={styles.tableCard}>
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد طلبات مطابقة.">
        {({ items, meta }) => {
          const total = meta.total ?? items.length;
          return (
            <>
              <div className={styles.tableSummary}>تم العثور على {total} طلب</div>

              <div className={styles.responsiveTable}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الحالة</th>
                      <th>الأولوية</th>
                      <th>القسم</th>
                      <th>مقدم الطلب</th>
                      <th>النوع</th>
                      <th>العنوان</th>
                      <th>الرقم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((req) => {
                      const st = pick(REQUEST_STATUS, req.status);
                      const pr = pick(PRIORITY, req.priority);
                      const requester = req.requester?.name ?? req.requester_name ?? "—";
                      return (
                        <tr key={req.id}>
                          <td className={styles.dateCell}>{formatDate(req.created_at)}</td>
                          <td>
                            <span className={`${styles.badge} ${statusClass(st.tone)}`}>{st.label}</span>
                          </td>
                          <td>
                            <span className={`${styles.badge} ${prioClass(pr.tone)}`}>{pr.label}</span>
                          </td>
                          <td className={styles.deptCell}>{req.department ?? "—"}</td>
                          <td>
                            <div className={styles.requesterBox}>
                              <span className={styles.reqName}>{requester}</span>
                              <div className={styles.avatar} style={avatarColors(requester)}>
                                {initialOf(requester)}
                              </div>
                            </div>
                          </td>
                          <td className={styles.typeCell}>{req.type ?? "—"}</td>
                          <td className={styles.titleCell}>
                            <Link href={`/dashboard/requests/${req.id}`} className={styles.tableLink}>
                              {req.title}
                            </Link>
                          </td>
                          <td className={styles.idCell}>
                            <Link href={`/dashboard/requests/${req.id}`} className={styles.tableLink}>
                              {req.code ?? req.id}
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
                  {query.isFetching ? " …" : ""}
                </div>
              </div>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
