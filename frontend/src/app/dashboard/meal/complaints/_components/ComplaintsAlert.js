"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { getComplaintStats } from "@/services/meal.service";
import styles from "./ComplaintsAlert.module.css";

/** Shown only when there are open sensitive complaints (count comes from the stats endpoint). */
export default function ComplaintsAlert({ onShowSensitive }) {
  const { data } = useQuery({ queryKey: ["meal", "complaints", "stats"], queryFn: getComplaintStats });
  const open = Number(data?.sensitive_open ?? data?.sensitive ?? 0);
  if (!open) return null;

  return (
    <div className={styles.alertBar} role="alert">
      <div className={styles.alertText}>
        <ShieldAlert size={17} className={styles.alertIcon} />
        <span>تنبيه: يوجد {open} شكوى حساسة مفتوحة تحتاج متابعة فورية</span>
      </div>
      <button type="button" className={styles.alertBtn} onClick={onShowSensitive}>
        عرض الحساسة
      </button>
    </div>
  );
}
