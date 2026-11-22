"use client";

import React, { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import QueryState from "@/components/ui/QueryState";
import useDebounce from "@/hooks/useDebounce";
import { getMealActivity } from "@/services/meal.service";
import { ACTIVITY_STATUS, ACTIVITY_TYPE_STYLE } from "@/lib/labels";
import { formatIsoDay } from "@/lib/format";
import styles from "./MealActivityTable.module.css";

const TYPE_LABEL = { activity: "نشاط ميداني", visit: "زيارة متابعة", complaint: "شكوى" };

export default function MealActivityTable() {
  const [filter, setFilter] = useState("all"); // all | activity | complaint
  const [searchQuery, setSearchQuery] = useState("");
  const search = useDebounce(searchQuery);

  const params = { type: filter, search, per_page: 10 };
  const query = useQuery({
    queryKey: ["meal", "activity", params],
    queryFn: () => getMealActivity(params),
    placeholderData: keepPreviousData,
  });

  const tab = (code, label) => (
    <button
      type="button"
      className={`${styles.filterBtn} ${filter === code ? styles.activeFilter : ""}`}
      onClick={() => setFilter(code)}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableHeader}>
        <Link href="/dashboard/meal/field-data" className={styles.headerLink}>
          عرض الكل
        </Link>
        <div className={styles.titleBlock}>
          <h3 className={styles.cardTitle}>آخر الأنشطة والشكاوى</h3>
          <span className={styles.cardSubtitle}>آخر السجلات الميدانية والشكاوى عبر المشاريع</span>
        </div>
      </div>

      <div className={styles.controlsContainer}>
        <div className={styles.filterTabs}>
          {tab("all", "الكل")}
          {tab("activity", "الأنشطة فقط")}
          {tab("complaint", "الشكاوى فقط")}
        </div>
        <input
          type="search"
          placeholder="ابحث عن مشروع، نشاط، أو موقع..."
          aria-label="بحث في الأنشطة"
          className={styles.searchInput}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className={styles.tableWrapper}>
        <QueryState query={query} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد نتائج مطابقة لبحثك">
          {({ items }) => (
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>الحالة</th>
                  <th>النوع</th>
                  <th>الموقع</th>
                  <th>المشروع</th>
                  <th>النشاط / الشكوى</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const st = ACTIVITY_STATUS[r.status] ?? { label: r.status, cls: "" };
                  return (
                    <tr key={`${r.type}-${r.id}`}>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[st.cls] || ""}`}>{st.label}</span>
                      </td>
                      <td>
                        <span className={`${styles.typeBadge} ${styles[ACTIVITY_TYPE_STYLE[r.type] || "typeBlue"]}`}>
                          {r.type_label ?? TYPE_LABEL[r.type] ?? r.type}
                        </span>
                      </td>
                      <td className={styles.plainCell}>{r.location ?? "—"}</td>
                      <td className={styles.plainCell}>{r.project ?? "—"}</td>
                      <td className={styles.activityCell}>{r.title}</td>
                      <td className={styles.dateCell}>{formatIsoDay(r.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </QueryState>
      </div>
    </div>
  );
}
