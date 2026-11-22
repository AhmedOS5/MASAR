"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import useDashboardSummary from "@/hooks/useDashboardSummary";
import { ErrorBanner, EmptyState, Skeleton } from "@/components/ui/QueryState";
import { UnitIcon } from "@/lib/icons";
import { formatDate } from "@/lib/format";
import styles from "./WeeklyActivity.module.css";

const UNIT_COLORS = ["blueIcon", "greenIcon", "purpleIcon"];

/** Round the axis maximum up to a "nice" number so labels are readable. */
export function niceMax(max) {
  if (!max || max <= 0) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

export default function WeeklyActivity() {
  const query = useDashboardSummary();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (query.isPending) return <Skeleton rows={4} block />;
  if (query.isError) return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;

  const units = query.data?.active_units ?? [];
  const week = query.data?.weekly_activity ?? [];
  const totals = week.map((d) => Number(d.requests || 0) + Number(d.tasks || 0));
  const axisMax = niceMax(Math.max(0, ...totals));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(axisMax * f));

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
            units.map((unit, i) => (
              <div key={unit.id} className={styles.unitItem}>
                <div className={`${styles.unitIcon} ${styles[UNIT_COLORS[i % UNIT_COLORS.length]]}`}>
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
              <span className={styles.dotBtn}></span>الطلبات + المهام
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

            <div className={styles.barsWrapper}>
              {week.map((item, index) => (
                <div key={item.date ?? index} className={styles.barColumn}>
                  <div className={styles.barContainer}>
                    <div
                      className={styles.mainBar}
                      title={`الطلبات: ${item.requests ?? 0} — المهام: ${item.tasks ?? 0}`}
                      style={{
                        height: isMounted ? `${(totals[index] / axisMax) * 100}%` : "0%",
                        transition: `height 1s ease-out ${(index * 0.1).toFixed(2)}s`,
                      }}
                    ></div>
                  </div>
                  <span className={styles.barLabel}>
                    {formatDate(item.date, { weekday: "long" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
