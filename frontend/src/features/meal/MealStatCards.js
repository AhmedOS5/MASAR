"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBanner, Skeleton } from "@/components/ui/QueryState";
import { formatNumber } from "@/lib/format";

/**
 * Generic five-card stats strip used by complaints / indicators / reports.
 * `styles` is the calling screen's CSS module (they share class names).
 * cards: [{ key, label, sublabel?: string | (stats) => string, icon, iconClass, color }]
 */
export default function MealStatCards({ queryKey, queryFn, cards, styles }) {
  const query = useQuery({ queryKey, queryFn });

  if (query.isPending) return <Skeleton rows={2} block />;
  if (query.isError) return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;

  const stats = query.data || {};
  return (
    <div className={styles.gridContainer}>
      {cards.map(({ key, label, sublabel, icon: Icon, iconClass, color }) => (
        <div key={key} className={styles.statCard}>
          <div className={styles.iconRow}>
            <div className={`${styles.iconBox} ${styles[iconClass]}`}>
              <Icon size={18} />
            </div>
          </div>
          <h2 className={styles.value} style={{ color }}>
            {formatNumber(stats[key])}
          </h2>
          <span className={styles.label}>{label}</span>
          {sublabel && (
            <span className={styles.sublabel}>
              {typeof sublabel === "function" ? sublabel(stats) : sublabel}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
