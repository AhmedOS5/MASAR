"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/QueryState";
import { getMealCharts } from "@/services/meal.service";
import { DISTRIBUTION_COLORS, QUARTER_LABELS } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import styles from "./MealCharts.module.css";

/** Round an axis maximum up to a readable value (e.g. 1250 -> 1500). */
export function niceMax(max) {
  if (!max || max <= 0) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= max) ?? 10;
  return step * pow;
}

/** conic-gradient stops from [{percent, color}] */
export function conicStops(segments) {
  let acc = 0;
  return segments
    .map((seg) => {
      const start = acc;
      acc += Number(seg.percent) || 0;
      return `${seg.color} ${start}% ${acc}%`;
    })
    .join(", ");
}

export default function MealCharts() {
  const [quarter, setQuarter] = useState(null); // null => server default
  const [animatedFor, setAnimatedFor] = useState(null);

  const query = useQuery({
    queryKey: ["meal", "charts", quarter],
    queryFn: () => getMealCharts(quarter ?? undefined),
    placeholderData: keepPreviousData,
  });

  const data = query.data;

  // Bars grow from 0 whenever a new dataset arrives (state only changes inside the timer callback).
  useEffect(() => {
    const t = setTimeout(() => setAnimatedFor(data), 50);
    return () => clearTimeout(t);
  }, [data]);
  const isMounted = animatedFor === data && data !== undefined;

  if (query.isPending) return <Skeleton rows={4} block />;
  if (query.isError && !data) return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;

  const indicators = data?.indicators ?? [];
  const distribution = (data?.distribution ?? []).map((d, i) => ({
    ...d,
    color: DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length],
  }));
  const quarters = data?.quarters ?? [];
  const activeQuarter = quarter ?? data?.quarter;
  const axisMax = niceMax(Math.max(0, ...indicators.flatMap((i) => [Number(i.target) || 0, Number(i.actual) || 0])));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(axisMax * f));

  return (
    <div className={styles.chartsContainer}>
      {/* 1. المؤشرات: المستهدف مقابل الفعلي */}
      <div className={styles.barCard}>
        <div className={styles.cardHeader}>
          <div className={styles.quarterTabs}>
            {quarters.map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={activeQuarter === q}
                onClick={() => setQuarter(q)}
                style={{
                  background: activeQuarter === q ? "#2563eb" : "#f1f5f9",
                  color: activeQuarter === q ? "#fff" : "#64748b",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 12px",
                  fontSize: 11,
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {QUARTER_LABELS[q] ?? q}
              </button>
            ))}
          </div>
          <div className={styles.titleBlock}>
            <h3 className={styles.cardTitle}>المؤشرات: المستهدف مقابل الفعلي</h3>
            <span className={styles.cardSubtitle}>مقارنة مبسطة حسب القطاع</span>
          </div>
        </div>

        <div className={styles.chartLegends}>
          <span className={styles.legendItem}>
            <span className={styles.dotActual}></span>الفعلي
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dotTarget}></span>المستهدف
          </span>
        </div>

        {indicators.length === 0 ? (
          <EmptyState>لا توجد بيانات مؤشرات لهذه الفترة.</EmptyState>
        ) : (
          <div className={styles.chartBody}>
            <div className={styles.yAxisLines}>
              {ticks.map((t, i) => (
                <span key={i}>{formatNumber(t)}</span>
              ))}
            </div>

            <div className={styles.barsWrapper}>
              {indicators.map((item, idx) => (
                <div key={item.sector} className={styles.barColumn}>
                  <div className={styles.barsPair}>
                    <div
                      className={styles.targetBar}
                      style={{
                        height: isMounted ? `${(item.target / axisMax) * 100}%` : "0%",
                        transition: `height 0.8s ease-out ${(idx * 0.1).toFixed(2)}s`,
                      }}
                      title={`المستهدف: ${item.target}`}
                    ></div>
                    <div
                      className={styles.actualBar}
                      style={{
                        height: isMounted ? `${(item.actual / axisMax) * 100}%` : "0%",
                        transition: `height 0.8s ease-out ${(idx * 0.1 + 0.05).toFixed(2)}s`,
                      }}
                      title={`الفعلي: ${item.actual}`}
                    ></div>
                  </div>
                  <span className={styles.barLabel}>{item.sector}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. توزيع المستفيدين */}
      <div className={styles.donutCard}>
        <div className={styles.cardHeader}>
          <Link href="/dashboard/meal/indicators" className={styles.headerLink}>
            عرض التفاصيل
          </Link>
          <div className={styles.titleBlock}>
            <h3 className={styles.cardTitle}>توزيع المستفيدين</h3>
            <span className={styles.cardSubtitle}>
              {data?.total_beneficiaries != null
                ? `إجمالي ${formatNumber(data.total_beneficiaries)} مستفيد`
                : "—"}
            </span>
          </div>
        </div>

        {distribution.length === 0 ? (
          <EmptyState>لا توجد بيانات توزيع.</EmptyState>
        ) : (
          <>
            <div className={styles.donutWrapper}>
              <div
                className={styles.donutChart}
                style={{
                  background: `conic-gradient(${conicStops(distribution)})`,
                  transform: isMounted ? "scale(1)" : "scale(0.8)",
                  opacity: isMounted ? 1 : 0,
                  transition: "all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              >
                <div className={styles.donutHole}></div>
              </div>
            </div>

            <div className={styles.donutLegend}>
              {distribution.map((seg) => (
                <span key={seg.label} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ backgroundColor: seg.color }}></span>
                  {seg.label} — {seg.percent}%
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
