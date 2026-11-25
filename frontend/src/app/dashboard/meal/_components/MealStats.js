"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  FileText,
  Monitor,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { ErrorBanner, Skeleton } from "@/components/ui/QueryState";
import { getMealStats } from "@/services/meal.service";
import styles from "./MealStats.module.css";

// Card chrome only. Values and trend texts come from GET /meal/stats:
// { late_indicators:{value,trend:{text,direction}}, completion_rate:{...}, beneficiaries, active_projects, reports_in_review, complaints_in_progress }
const CARDS = [
  { key: "late_indicators", title: "المؤشرات المتأخرة", icon: AlertTriangle, iconClass: "redIcon" },
  { key: "completion_rate", title: "نسبة إنجاز المشاريع", icon: CheckCircle2, iconClass: "greenIcon", percent: true },
  { key: "beneficiaries", title: "إجمالي المستفيدين", icon: Users, iconClass: "blueIcon" },
  { key: "active_projects", title: "المشاريع النشطة", icon: Monitor, iconClass: "tealIcon" },
  { key: "reports_in_review", title: "التقارير قيد المراجعة", icon: FileText, iconClass: "skyIcon" },
  { key: "complaints_in_progress", title: "الشكاوى قيد المعالجة", icon: MessageSquare, iconClass: "orangeIcon" },
];

const TREND_CLASS = { up: "trendUp", down: "trendDown", neutral: "trendNeutral" };

export default function MealStats() {
  const query = useQuery({ queryKey: ["meal", "stats"], queryFn: getMealStats });

  if (query.isPending) return <Skeleton rows={3} block />;
  if (query.isError) return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;

  const stats = query.data || {};

  return (
    <div className={styles.gridContainer}>
      {CARDS.map(({ key, title, icon: Icon, iconClass, percent }) => {
        const stat = stats[key] || {};
        const dir = stat.trend?.direction;
        return (
          <div key={key} className={styles.statCard}>
            <div className={`${styles.iconBox} ${styles[iconClass]}`}>
              <Icon size={20} aria-hidden="true" />
            </div>

            <div className={styles.cardBody}>
              <h2 className={styles.cardValue}>
                <AnimatedNumber value={stat.value} decimals={percent ? 1 : 0} suffix={percent ? "%" : ""} />
              </h2>
              <span className={styles.cardTitle}>{title}</span>
              {stat.trend?.text && (
                <span className={`${styles.trendTag} ${styles[TREND_CLASS[dir] || "trendNeutral"]}`}>
                  {dir === "up" && <ChevronUp size={13} />}
                  {dir === "down" && <ChevronDown size={13} />}
                  {stat.trend.text}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
