"use client";

import React from "react";
import { Clock, CheckCircle2, AlertTriangle, TimerReset, ShieldCheck } from "lucide-react";
import MealStatCards from "@/features/meal/MealStatCards";
import { getIndicatorStats } from "@/services/meal.service";
import styles from "./IndicatorsStats.module.css";

// Numbers come from GET /meal/indicators/stats
const CARDS = [
  {
    key: "total",
    label: "كل المؤشرات",
    sublabel: (s) => (s.projects_count != null ? `ضمن ${s.projects_count} مشاريع` : ""),
    icon: Clock,
    iconClass: "blueIcon",
    color: "#2563eb",
  },
  { key: "on_track", label: "على المسار", sublabel: "تسير حسب الخطة", icon: CheckCircle2, iconClass: "greenIcon", color: "#16a34a" },
  { key: "needs_follow", label: "بحاجة متابعة", sublabel: "يحتاج تحديث أو مراجعة", icon: AlertTriangle, iconClass: "amberIcon", color: "#d97706" },
  { key: "delayed", label: "متأخرة", sublabel: "أقل من المتوقع", icon: TimerReset, iconClass: "redIcon", color: "#dc2626" },
  { key: "achieved", label: "محققة", sublabel: "وصلت إلى الهدف", icon: ShieldCheck, iconClass: "purpleIcon", color: "#7c3aed" },
];

export default function IndicatorsStats() {
  return (
    <MealStatCards
      queryKey={["meal", "indicators", "stats"]}
      queryFn={getIndicatorStats}
      cards={CARDS}
      styles={styles}
    />
  );
}
