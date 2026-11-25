"use client";

import React from "react";
import Link from "next/link";
import QueryState from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import ui from "@/components/ui/ui.module.css";
import { REQUEST_STATUS, PRIORITY, badgeTone, pick } from "@/lib/labels";
import { formatDate, initialOf } from "@/lib/format";

export default function RequestsTable({ query, page, onPageChange }) {
  return (
    <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد طلبات مطابقة.">
      {({ items, meta }) => {
        const total = meta.total ?? items.length;
        return (
          <div className={ui.tableCard}>
            <div className={ui.tableSummary}>تم العثور على {total} طلب</div>

            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">الرقم</th>
                    <th scope="col">العنوان</th>
                    <th scope="col">النوع</th>
                    <th scope="col">مقدم الطلب</th>
                    <th scope="col">القسم</th>
                    <th scope="col">الأولوية</th>
                    <th scope="col">الحالة</th>
                    <th scope="col">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((req) => {
                    const st = pick(REQUEST_STATUS, req.status);
                    const pr = pick(PRIORITY, req.priority);
                    const requester = req.requester?.name ?? req.requester_name ?? "—";
                    return (
                      <tr key={req.id}>
                        <td className={ui.mono}>
                          <Link href={`/dashboard/requests/${req.id}`} className={ui.tableLink}>
                            {req.code ?? req.id}
                          </Link>
                        </td>
                        <td>
                          <Link href={`/dashboard/requests/${req.id}`} className={ui.tableLink}>
                            {req.title}
                          </Link>
                        </td>
                        <td>{req.type ?? "—"}</td>
                        <td>
                          <span className={ui.inlineCell}>
                            <span className={ui.avatarSm} aria-hidden="true">{initialOf(requester)}</span>
                            <span>{requester}</span>
                          </span>
                        </td>
                        <td>{req.department ?? "—"}</td>
                        <td>
                          <span className={`${ui.badge} ${ui[`badge_${badgeTone(pr.tone)}`]}`}>{pr.label}</span>
                        </td>
                        <td>
                          <span className={`${ui.badge} ${ui[`badge_${badgeTone(st.tone)}`]}`}>{st.label}</span>
                        </td>
                        <td className={ui.mono}>{formatDate(req.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={ui.tableFooter}>
              <span>
                عرض {items.length} من {total}
                {query.isFetching ? " …" : ""}
              </span>
              <Pagination page={meta.current_page ?? page} lastPage={meta.last_page ?? 1} onChange={onPageChange} />
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
