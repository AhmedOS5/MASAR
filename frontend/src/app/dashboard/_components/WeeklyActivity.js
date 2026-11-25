"use client";

import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import useDashboardSummary from "@/hooks/useDashboardSummary";
import { ErrorBanner, EmptyState, Skeleton } from "@/components/ui/QueryState";
import { UnitIcon } from "@/lib/icons";
import { formatDate } from "@/lib/format";
import styles from "./WeeklyActivity.module.css";

/** Round the axis maximum up to a "nice" number so labels are readable. */
export function niceMax(max) {
  if (!max || max <= 0) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

const W = 600; // SVG user units; the chart stretches to its card (preserveAspectRatio="none", non-scaling strokes)
const H = 200;

/** Stacked area geometry for one day-column per entry: tasks at the bottom, requests on top, so the top edge is the daily total. */
export function areaPaths(week, axisMax) {
  const n = week.length;
  // The page is right-to-left (day labels run right to left) but SVG coordinates always run left to right: mirror x so
  // the first (oldest) day sits on the right, exactly above its label.
  const x = (i) => ((n - i - 0.5) / n) * W;
  const y = (v) => H - (Math.min(v, axisMax) / axisMax) * H;
  const tasks = week.map((d) => Number(d.tasks || 0));
  const totals = week.map((d, i) => tasks[i] + Number(d.requests || 0));
  const line = (vals) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const back = (vals) => [...vals.keys()].reverse().map((i) => `L${x(i).toFixed(1)} ${y(vals[i]).toFixed(1)}`).join(" ");
  const base = week.map(() => 0);
  return {
    tasksArea: `${line(tasks)} ${back(base)} Z`,
    requestsArea: `${line(totals)} ${back(tasks)} Z`,
    totalLine: line(totals),
    tasksLine: line(tasks),
  };
}

export default function WeeklyActivity() {
  const query = useDashboardSummary();
  if (query.isPending) return <Skeleton rows={4} block />;
  if (query.isError) return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;

  const units = query.data?.active_units ?? [];
  const week = query.data?.weekly_activity ?? [];
  const totals = week.map((d) => Number(d.requests || 0) + Number(d.tasks || 0));
  const axisMax = niceMax(Math.max(0, ...totals));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(axisMax * f));
  const paths = week.length ? areaPaths(week, axisMax) : null;

  return (
    <div className={styles.activityContainer}>
      {/* 1. كرت الوحدات المفعّلة */}
      <div className={styles.unitsCard}>
        <div className={styles.cardHeader}>
          <Link href="/dashboard/units" className={styles.headerLink}>
            إدارة الوحدات
          </Link>
          <h3 className={styles.cardTitle}>الوحدات المفعّلة</h3>
        </div>

        <div className={styles.unitsList}>
          {units.length === 0 ? (
            <EmptyState>لا توجد وحدات مفعّلة بعد.</EmptyState>
          ) : (
            units.map((unit) => (
              <div key={unit.id} className={styles.unitItem}>
                <div className={styles.unitIcon}>
                  <UnitIcon name={unit.icon} size={16} />
                </div>
                <span className={styles.unitName}>{unit.title}</span>
                <span className={styles.statusDot}></span>
              </div>
            ))
          )}
        </div>

        <Link href="/dashboard/units" className={styles.addUnitBtn}>
          <Plus size={14} />
          <span>إضافة وحدة جديدة</span>
        </Link>
      </div>

      {/* 2. كرت الرسم البياني (نشاط الأسبوع) */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div className={styles.chartLegends}>
            <span className={styles.legendItem}>
              <span className={styles.dotTasks}></span>المهام
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotRequests}></span>الطلبات
            </span>
          </div>
          <h3 className={styles.cardTitle}>نشاط الأسبوع</h3>
        </div>

        {week.length === 0 ? (
          <EmptyState>لا يوجد نشاط مسجّل لهذا الأسبوع.</EmptyState>
        ) : (
          <div className={styles.chartBody}>
            <div className={styles.yAxisLines}>
              {ticks.map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>

            <div className={styles.plot}>
              <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="نشاط الأسبوع: الطلبات والمهام لكل يوم">
                {ticks.slice(0, -1).map((t, i) => (
                  <line key={i} className={styles.gridLine} x1="0" x2={W} y1={(i / 4) * H} y2={(i / 4) * H} />
                ))}
                <path className={styles.areaRequests} d={paths.requestsArea} />
                <path className={styles.areaTasks} d={paths.tasksArea} />
                <path className={styles.lineTotal} d={paths.totalLine} />
                <path className={styles.lineTasks} d={paths.tasksLine} />
              </svg>
              <div className={styles.dayLabels}>
                {week.map((item, index) => (
                  <span
                    key={item.date ?? index}
                    className={styles.barLabel}
                    title={`الطلبات: ${item.requests ?? 0} — المهام: ${item.tasks ?? 0}`}
                  >
                    {formatDate(item.date, { weekday: "long" })}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
