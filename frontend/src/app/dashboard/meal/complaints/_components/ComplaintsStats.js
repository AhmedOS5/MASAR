"use client";

import React from "react";
import { MessageSquare, Mail, Clock, Shield, CheckCircle2 } from "lucide-react";
import MealStatCards from "@/features/meal/MealStatCards";
import { getComplaintStats } from "@/services/meal.service";
import styles from "./ComplaintsStats.module.css";

// Order as designed (RTL). Numbers come from GET /meal/complaints/stats.
const CARDS = [
  { key: "total", label: "كل الشكاوى", sublabel: "من جميع المشاريع", icon: MessageSquare, iconClass: "blueIcon", color: "#2563eb" },
  { key: "new", label: "جديدة", sublabel: "بانتظار المراجعة", icon: Mail, iconClass: "indigoIcon", color: "#4f46e5" },
  { key: "in_progress", label: "قيد المعالجة", sublabel: "تحتاج متابعة", icon: Clock, iconClass: "amberIcon", color: "#d97706" },
  { key: "sensitive", label: "حساسة", sublabel: "وصول مقيّد", icon: Shield, iconClass: "redIcon", color: "#dc2626" },
  { key: "resolved", label: "تم حلها", sublabel: "أُغلقت بنجاح", icon: CheckCircle2, iconClass: "greenIcon", color: "#16a34a" },
];

export default function ComplaintsStats() {
  return (
    <MealStatCards
      queryKey={["meal", "complaints", "stats"]}
      queryFn={getComplaintStats}
      cards={CARDS}
      styles={styles}
    />
  );
}
