"use client";

import React, { useState, useEffect } from "react";
import { Users, ClipboardList, Activity, Bell, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

// Card chrome only (titles/icons). Every number and trend text comes from the API. All icons share one neutral style:
// colour is reserved for meaning (the trend), never decoration.
const CARDS = [
  { key: "active_users", title: "المستخدمون النشطون", icon: Users },
  { key: "open_tasks", title: "المهام المفتوحة", icon: ClipboardList },
  { key: "running_operations", title: "العمليات الجارية", icon: Activity },
  { key: "important_alerts", title: "التنبيهات المهمة", icon: Bell },
];

// The arrow carries the direction too, so the trend is never conveyed by colour alone.
const TREND = {
  up: { cls: styles.trendUp, Icon: TrendingUp },
  down: { cls: styles.trendDown, Icon: TrendingDown },
};
const NEUTRAL_TREND = { cls: styles.trendNeutral, Icon: Minus };

export default function StatsGrid() {
  const query = useDashboardSummary();

  if (query.isPending) return <Skeleton rows={2} block />;
  if (query.isError) return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;

  const stats = query.data?.stats || {};

  return (
    <div className={styles.gridContainer}>
      {CARDS.map(({ key, title, icon: Icon }) => {
        const stat = stats[key] || {};
        const trend = TREND[stat.trend] ?? NEUTRAL_TREND;
        return (
          <div key={key} className={styles.statCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>{title}</span>
              <span className={styles.iconBox} aria-hidden="true">
                <Icon size={18} />
              </span>
            </div>
            <h2 className={styles.cardValue}>
              <AnimatedCounter endValue={stat.value} />
            </h2>
            {stat.trend_text && (
              <span className={`${styles.trendTag} ${trend.cls}`}>
                <trend.Icon size={14} aria-hidden="true" />
                {stat.trend_text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
