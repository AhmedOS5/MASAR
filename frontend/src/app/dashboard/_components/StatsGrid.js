"use client";

import React, { useState, useEffect } from "react";
import { Users, ClipboardList, Activity, Bell } from "lucide-react";
import useDashboardSummary from "@/hooks/useDashboardSummary";
import { ErrorBanner, Skeleton } from "@/components/ui/QueryState";
import styles from "./StatsGrid.module.css";

// مكوّن لعمل تأثير العداد للأرقام
export const AnimatedCounter = ({ endValue, duration = 1200 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime = null;
    let frame;
    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const percent = Math.min((currentTime - startTime) / duration, 1);
      const easeOut = percent === 1 ? 1 : 1 - Math.pow(2, -10 * percent);
      setCount(Math.floor(Number(endValue || 0) * easeOut));
      if (percent < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [endValue, duration]);

  return <>{count}</>;
};

// Card chrome only (titles/icons). Every number and trend text comes from the API.
const CARDS = [
  { key: "active_users", title: "المستخدمون النشطون", icon: Users, iconClass: "greenIcon" },
  { key: "open_tasks", title: "المهام المفتوحة", icon: ClipboardList, iconClass: "blueIcon" },
  { key: "running_operations", title: "العمليات الجارية", icon: Activity, iconClass: "purpleIcon" },
  { key: "important_alerts", title: "التنبيهات المهمة", icon: Bell, iconClass: "orangeIcon" },
];

const trendClass = (trend) =>
  trend === "up" ? styles.trendUp : trend === "down" ? styles.trendDown : styles.neutralText;

export default function StatsGrid() {
  const query = useDashboardSummary();

  if (query.isPending) return <Skeleton rows={2} block />;
  if (query.isError) return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;

  const stats = query.data?.stats || {};

  return (
    <div className={styles.gridContainer}>
      {CARDS.map(({ key, title, icon: Icon, iconClass }) => {
        const stat = stats[key] || {};
        return (
          <div key={key} className={styles.statCard}>
            <div className={styles.cardHeader}>
              <div className={`${styles.iconBox} ${styles[iconClass]}`}>
                <Icon size={20} />
              </div>
              <div className={styles.titleInfo}>
                <span className={styles.cardTitle}>{title}</span>
                <h2 className={styles.cardValue}>
                  <AnimatedCounter endValue={stat.value} />
                </h2>
              </div>
            </div>
            {stat.trend_text && (
              <div className={styles.cardFooter}>
                <span className={`${styles.trendTag} ${trendClass(stat.trend)}`}>
                  {stat.trend_text}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
