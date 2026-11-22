"use client";

import React from "react";
import { Search } from "lucide-react";
import { INDICATOR_STATUS } from "@/lib/labels";
import styles from "./IndicatorsToolbar.module.css";

// Order as designed (RTL): on_track, needs_follow, delayed, achieved, then "all"
const TABS = [
  ...Object.entries(INDICATOR_STATUS).map(([code, { label }]) => ({ code, label })),
  { code: "all", label: "الكل" },
];

export default function IndicatorsToolbar({ filters, onChange }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.searchBox}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="بحث باسم المؤشر أو رمز المؤشر..."
          aria-label="بحث في المؤشرات"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>

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
  );
}
