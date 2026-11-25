"use client";

import React from "react";
import { FileText, Plus, Search } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { REQUEST_STATUS, PRIORITY } from "@/lib/labels";
import usePermissions from "@/hooks/usePermissions";
import styles from "./RequestsFilter.module.css";

// Tab order as designed (RTL): draft … pending, then "all"
const TAB_ORDER = ["draft", "rejected", "completed", "in_progress", "approved", "pending"];

export default function RequestsFilter({ filters, onChange, counts = {}, onCreate }) {
  const { can } = usePermissions();
  return (
    <>
      <PageHeader
        icon={FileText}
        title="الطلبات"
        subtitle="تابع طلبات العمل وحالاتها وأولوياتها."
        primary={
          can("requests.create") && (
            <button type="button" className={ui.primaryBtn} onClick={onCreate}>
              <Plus size={16} aria-hidden="true" /> <span>إنشاء طلب</span>
            </button>
          )
        }
      />

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

      <div className={ui.filterBar}>
        <label className={ui.searchBox}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="بحث في الطلبات..."
            aria-label="بحث في الطلبات"
            className={ui.input}
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
          />
        </label>
        <select className={ui.control} aria-label="الأولوية" value={filters.priority} onChange={(e) => onChange({ priority: e.target.value })}>
          <option value="all">كل الأولويات</option>
          {Object.entries(PRIORITY).map(([code, { label }]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </div>
    </>
  );
}
