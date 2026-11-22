"use client";

import React from "react";
import { Grid, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import styles from "./UnitsStats.module.css";

/** Counts are derived from the real unit list, never hard-coded. */
export default function UnitsStats({ units = [] }) {
  const count = (fn) => units.filter(fn).length;
  const cards = [
    { title: "إجمالي الوحدات", value: units.length, icon: Grid, tone: "blueIcon" },
    { title: "الوحدات المفعّلة", value: count((u) => u.status === "active"), icon: CheckCircle2, tone: "greenIcon" },
    { title: "غير المفعّلة", value: count((u) => u.status === "inactive"), icon: XCircle, tone: "redIcon" },
    { title: "تحتاج إلى إعداد", value: count((u) => u.status === "setup_required"), icon: AlertCircle, tone: "orangeIcon" },
  ];

  return (
    <div className={styles.statsGrid}>
      {cards.map(({ title, value, icon: Icon, tone }) => (
        <div key={title} className={styles.statCard}>
          <div className={`${styles.iconBox} ${styles[tone]}`}>
            <Icon size={20} />
          </div>
          <div className={styles.meta}>
            <span className={styles.title}>{title}</span>
            <h2 className={styles.value}>{value}</h2>
          </div>
        </div>
      ))}
    </div>
  );
}
