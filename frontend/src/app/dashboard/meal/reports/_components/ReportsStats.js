"use client";

import React from "react";
import { FileText, PenLine, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import MealStatCards from "@/features/meal/MealStatCards";
import { getMealReportStats } from "@/services/meal.service";
import styles from "./ReportsStats.module.css";

// Numbers come from GET /meal/reports/stats
const CARDS = [
  { key: "total", label: "كل التقارير", sublabel: "ضمن وحدة MEAL", icon: FileText, iconClass: "blueIcon", color: "#2563eb" },
  { key: "draft", label: "مسودات", sublabel: "لم تُرسل بعد", icon: PenLine, iconClass: "slateIcon", color: "#64748b" },
  { key: "in_review", label: "قيد المراجعة", sublabel: "بانتظار الاعتماد", icon: Clock, iconClass: "amberIcon", color: "#d97706" },
  { key: "needs_edit", label: "بحاجة تعديل", sublabel: "تحتاج تحديث", icon: AlertTriangle, iconClass: "redIcon", color: "#dc2626" },
  { key: "approved", label: "معتمدة", sublabel: "جاهزة للتصدير", icon: CheckCircle2, iconClass: "greenIcon", color: "#16a34a" },
];

export default function ReportsStats() {
  return (
    <MealStatCards
      queryKey={["meal", "reports", "stats"]}
      queryFn={getMealReportStats}
      cards={CARDS}
      styles={styles}
    />
  );
}
