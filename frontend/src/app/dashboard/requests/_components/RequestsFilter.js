"use client";

import React from "react";
import { Plus, Search, ChevronDown } from "lucide-react";
import { REQUEST_STATUS, PRIORITY } from "@/lib/labels";
import usePermissions from "@/hooks/usePermissions";
import styles from "./RequestsFilter.module.css";

// Tab order as designed (RTL): draft … pending, then "all"
const TAB_ORDER = ["draft", "rejected", "completed", "in_progress", "approved", "pending"];

export default function RequestsFilter({ filters, onChange, counts = {}, onCreate }) {
  const { can } = usePermissions();
  return (
    <div className={styles.filterWrapper}>
      <div className={styles.headerRow}>
        {can("requests.create") && (
          <button type="button" className={styles.createBtn} onClick={onCreate}>
            <Plus size={16} />
            <span>إنشاء طلب</span>
          </button>
        )}
        <h2 className={styles.pageTitle}>الطلبات</h2>
      </div>

      <div className={styles.tabsRow} role="tablist" aria-label="حالة الطلب">
        {[...TAB_ORDER, "all"].map((code) => {
          const active = filters.status === code;
          const count = code === "all" ? null : counts?.[code];
          return (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.tabBtn} ${active ? styles.activeTab : ""}`}
              onClick={() => onChange({ status: code })}
            >
              {count ? <span className={styles.badgeCount}>{count}</span> : null}
              <span>{code === "all" ? "الكل" : REQUEST_STATUS[code].label}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.searchRow}>
        <div className={styles.dropdownWrapper}>
          <ChevronDown size={16} className={styles.dropdownIcon} />
          <select
            className={styles.prioritySelect}
            aria-label="الأولوية"
            value={filters.priority}
            onChange={(e) => onChange({ priority: e.target.value })}
          >
            <option value="all">كل الأولويات</option>
            {Object.entries(PRIORITY).map(([code, { label }]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>

        <div className={styles.searchContainer}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="search"
            placeholder="بحث في الطلبات..."
            aria-label="بحث في الطلبات"
            className={styles.searchInput}
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
