"use client";

import React from "react";
import styles from "./UnitsFilter.module.css";

// Tab order as designed (RTL). `code` keys are interpreted by UNIT_FILTERS in ../page.js
const TABS = [
  { code: "setup", label: "تحتاج إلى إعداد" },
  { code: "optional", label: "اختيارية" },
  { code: "core", label: "أساسية" },
  { code: "inactive", label: "غير مفعّلة" },
  { code: "active", label: "مفعّلة" },
  { code: "all", label: "الكل" },
];

export default function UnitsFilter({ filter, onFilter, search, onSearch }) {
  return (
    <div className={styles.filterBar}>
      <input
        type="search"
        placeholder="ابحث عن وحدة..."
        aria-label="ابحث عن وحدة"
        className={styles.searchInput}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className={styles.tabsWrapper} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={filter === t.code}
            className={`${styles.tabBtn} ${filter === t.code ? styles.activeTab : ""}`}
            onClick={() => onFilter(t.code)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
