"use client";

import React from "react";
import { Search } from "lucide-react";
import useOptions from "@/hooks/useOptions";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import styles from "../tasks.module.css";

const asOption = (o) => (typeof o === "object" ? o : { value: o, label: o });

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      className={styles.filterSelect}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">{label}: الكل</option>
      {options.map((o) => {
        const opt = asOption(o);
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function TaskFilters({ filters, onChange }) {
  const { list } = useOptions();
  return (
    <div className={styles.filtersCard}>
      <FilterSelect label="المسؤول" value={filters.assignee_id} onChange={(v) => onChange({ assignee_id: v })} options={list("employees")} />
      <FilterSelect label="القسم" value={filters.department} onChange={(v) => onChange({ department: v })} options={list("departments")} />
      <FilterSelect
        label="الأولوية"
        value={filters.priority}
        onChange={(v) => onChange({ priority: v })}
        options={Object.entries(PRIORITY).map(([value, { label }]) => ({ value, label }))}
      />
      <FilterSelect
        label="الحالة"
        value={filters.status}
        onChange={(v) => onChange({ status: v })}
        options={Object.entries(TASK_STATUS).map(([value, { label }]) => ({ value, label }))}
      />

      <div className={styles.searchWrapper}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="search"
          placeholder="البحث عن مهمة..."
          aria-label="البحث عن مهمة"
          className={styles.searchInput}
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>
    </div>
  );
}
