"use client";

import React from "react";
import { Search } from "lucide-react";
import useOptions from "@/hooks/useOptions";
import { projectOptions, useWorkProjects } from "@/features/projects/ProjectField";
import { MEAL_REPORT_STATUS } from "@/lib/labels";
import styles from "./ReportsToolbar.module.css";

const TABS = [
  { code: "all", label: "الكل" },
  ...Object.entries(MEAL_REPORT_STATUS).map(([code, { label }]) => ({ code, label })),
];
const asOption = (o) => (typeof o === "object" ? o : { value: o, label: o });

function Filter({ label, value, onChange, options }) {
  return (
    <select className={styles.select} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{label}</option>
      {options.map((o) => {
        const opt = asOption(o);
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}

export default function ReportsToolbar({ filters, onChange, total }) {
  const { list } = useOptions();
  const projects = useWorkProjects();
  return (
    <div className={styles.toolbar}>
      <div className={styles.topRow}>
        <div className={styles.rightGroup}>
          {total != null && <span className={styles.count}>{total} تقرير</span>}
          <div className={styles.filters} role="tablist">
            {TABS.map((t) => (
              <button
                key={t.code}
                type="button"
                role="tab"
                aria-selected={filters.status === t.code}
                className={filters.status === t.code ? styles.filterPillActive : styles.filterPill}
                onClick={() => onChange({ status: t.code })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.selectsGroup}>
          <Filter label="كل المشاريع" value={filters.project_id} onChange={(v) => onChange({ project_id: v })} options={projectOptions(projects.data)} />
          <Filter label="كل الأنواع" value={filters.type} onChange={(v) => onChange({ type: v })} options={list("report_types")} />
          <Filter label="كل الفترات" value={filters.period} onChange={(v) => onChange({ period: v })} options={list("periods")} />
        </div>
      </div>

      <div className={styles.searchBox}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="بحث بعنوان التقرير أو اسم المشروع..."
          aria-label="بحث في التقارير"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>
    </div>
  );
}
