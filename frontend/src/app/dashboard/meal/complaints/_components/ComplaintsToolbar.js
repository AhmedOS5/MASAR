"use client";

import React from "react";
import { Search } from "lucide-react";
import useOptions from "@/hooks/useOptions";
import { projectOptions, useWorkProjects } from "@/features/projects/ProjectField";
import { COMPLAINT_PRIORITY, COMPLAINT_STATUS } from "@/lib/labels";
import styles from "./ComplaintsToolbar.module.css";

const TABS = [
  { code: "all", label: "الكل" },
  ...Object.entries(COMPLAINT_STATUS)
    .filter(([code]) => code !== "closed")
    .map(([code, { label }]) => ({ code, label })),
  { code: "sensitive", label: "حساسة" },
  { code: "closed", label: "مغلقة" },
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

export default function ComplaintsToolbar({ filters, onChange, total }) {
  const { list } = useOptions();
  const projects = useWorkProjects();
  return (
    <div className={styles.toolbar}>
      <div className={styles.topRow}>
        <div className={styles.rightGroup}>
          {total != null && <span className={styles.count}>{total} شكوى</span>}
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
          <Filter label="كل المناطق" value={filters.region} onChange={(v) => onChange({ region: v })} options={list("regions")} />
          <Filter
            label="كل الأولويات"
            value={filters.priority}
            onChange={(v) => onChange({ priority: v })}
            options={Object.entries(COMPLAINT_PRIORITY).map(([value, { label }]) => ({ value, label }))}
          />
        </div>
      </div>

      <div className={styles.searchBox}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="بحث برقم الشكوى أو نوع الشكوى..."
          aria-label="بحث في الشكاوى"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>
    </div>
  );
}
