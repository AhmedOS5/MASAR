"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react";
import QueryState, { EmptyState } from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import ui from "@/components/ui/ui.module.css";
import useDebounce from "@/hooks/useDebounce";
import { getPlatformStats, listOrganizations } from "@/services/platform.service";
import { ORG_STATUS, ORG_TYPE } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/format";
import { STATS_KEY } from "./StatsCards";
import styles from "../operator.module.css";

const FILTERS = ["all", "pending_approval", "approved", "suspended", "rejected", "incomplete"];
const FILTER_LABEL = { all: "الكل" };

export function StatusBadge({ status }) {
  const s = ORG_STATUS[status] ?? { label: status, tone: "neutral" };
  return <span className={`${ui.badge} ${ui[`badge_${s.tone}`]}`}>{s.label}</span>;
}

/** The one decision that fits the organization's current state (null when there is none, e.g. still onboarding). */
export function quickActionFor(status) {
  if (status === "pending_approval") return { kind: "approve", label: "اعتماد", cls: ui.successBtn };
  if (status === "approved") return { kind: "suspend", label: "تعليق", cls: ui.secondaryBtn };
  if (status === "suspended" || status === "rejected") return { kind: "activate", label: "تفعيل", cls: ui.primaryBtn };
  return null;
}

export default function OrganizationsPanel({ onReview, onDecide }) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebounce(search.trim(), 300);

  const stats = useQuery({ queryKey: STATS_KEY, queryFn: getPlatformStats });
  const query = useQuery({
    queryKey: ["platform", "organizations", { status, term, page }],
    queryFn: () => listOrganizations({ status, search: term, page, per_page: 10 }),
    placeholderData: keepPreviousData,
  });

  const counts = stats.data?.organizations;
  const countOf = (f) => (counts ? (f === "all" ? counts.total : counts.by_status[f]) : null);
  const filtered = status !== "all" || term !== "";
  const pick = (f) => {
    setStatus(f);
    setPage(1);
  };

  return (
    <section className={styles.panel} aria-labelledby="orgs-title">
      <div className={styles.panelHead}>
        <h2 id="orgs-title" className={styles.panelTitle}>
          <Building2 size={18} aria-hidden="true" /> إدارة المؤسسات
        </h2>
        <p className={styles.panelHint}>كل المؤسسات المسجلة في المنصة، الأحدث أولاً.</p>
      </div>

      <div className={ui.toolbar}>
        <div className={ui.segmented} role="group" aria-label="تصفية حسب الحالة">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`${ui.segment} ${status === f ? ui.segmentActive : ""}`}
              aria-pressed={status === f}
              onClick={() => pick(f)}
            >
              {FILTER_LABEL[f] ?? ORG_STATUS[f].label}
              {countOf(f) != null && <span className={ui.segmentCount}>{formatNumber(countOf(f))}</span>}
            </button>
          ))}
        </div>
        <label className={ui.searchBox}>
          <Search size={16} aria-hidden="true" />
          <input
            className={ui.input}
            type="search"
            placeholder="ابحث باسم المؤسسة أو بريدها"
            aria-label="بحث في المؤسسات"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      <QueryState query={query} rows={5}>
        {(res) =>
          res.data.length === 0 ? (
            <EmptyState
              icon={Building2}
              action={
                filtered ? (
                  <button
                    type="button"
                    className={ui.secondaryBtn}
                    onClick={() => {
                      setSearch("");
                      pick("all");
                    }}
                  >
                    مسح عوامل التصفية
                  </button>
                ) : null
              }
            >
              {filtered ? "لا توجد مؤسسات مطابقة لعوامل التصفية الحالية." : "لا توجد مؤسسات مسجلة في المنصة بعد."}
            </EmptyState>
          ) : (
            <>
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">المؤسسة</th>
                      <th scope="col">مدير الحساب</th>
                      <th scope="col">المنطقة</th>
                      <th scope="col">الموظفون</th>
                      <th scope="col">المستفيدون</th>
                      <th scope="col">تاريخ التسجيل</th>
                      <th scope="col">الحالة</th>
                      <th scope="col">
                        <span className={styles.srOnly}>إجراءات</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.map((o) => {
                      const action = quickActionFor(o.status);
                      return (
                        <tr key={o.id}>
                          <td>
                            <span className={ui.cellMain}>{o.name}</span>
                            <span className={ui.cellSub}>{ORG_TYPE[o.type] ?? o.type}</span>
                          </td>
                          <td>
                            <span>{o.admin?.name ?? "—"}</span>
                            {o.admin?.email && (
                              <span className={ui.cellSub} dir="ltr">
                                {o.admin.email}
                              </span>
                            )}
                          </td>
                          <td>{o.region ?? "—"}</td>
                          <td className={ui.num}>{formatNumber(o.employees_count ?? 0)}</td>
                          <td className={ui.num}>{formatNumber(o.beneficiaries_reached ?? 0)}</td>
                          <td className={ui.num}>{formatDate(o.created_at)}</td>
                          <td>
                            <StatusBadge status={o.status} />
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                className={`${ui.ghostBtn} ${ui.smallBtn}`}
                                aria-label={`مراجعة ${o.name}`}
                                onClick={() => onReview(o.id)}
                              >
                                مراجعة
                              </button>
                              {action && (
                                <button
                                  type="button"
                                  className={`${action.cls} ${ui.smallBtn}`}
                                  aria-label={`${action.label} ${o.name}`}
                                  onClick={() => onDecide({ organization: o, kind: action.kind })}
                                >
                                  {action.label}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={styles.tableFoot}>
                <span className={styles.tableCount}>
                  {formatNumber(res.meta?.total ?? res.data.length)} مؤسسة
                </span>
                <Pagination page={res.meta?.current_page ?? page} lastPage={res.meta?.last_page ?? 1} onChange={setPage} />
              </div>
            </>
          )
        }
      </QueryState>
    </section>
  );
}
