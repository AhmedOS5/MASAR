"use client";

import React from "react";
import { Plus, Download } from "lucide-react";
import { complaintsExportUrl } from "@/services/meal.service";
import usePermissions from "@/hooks/usePermissions";
import styles from "./ComplaintsHeader.module.css";

export default function ComplaintsHeader({ onCreate }) {
  const { can } = usePermissions();
  return (
    <div className={styles.headerRow}>
      <div className={styles.titleSide}>
        <div className={styles.titleLine}>
          <h2 className={styles.pageTitle}>الشكاوى والتغذية الراجعة</h2>
          <span className={styles.titleBadge}>إدارة المساءلة</span>
        </div>
        <p className={styles.subtitle}>
          تابع الشكاوى والتغذية الراجعة من المستفيدين لضمان المساءلة وتحسين جودة الخدمات.
        </p>
      </div>

      <div className={styles.actionsSide}>
        <a className={styles.btnOutline} href={complaintsExportUrl} download style={{ textDecoration: "none" }}>
          <Download size={15} />
          <span>تصدير القائمة</span>
        </a>
        {can("meal.manage") && (
          <button type="button" className={styles.btnPrimary} onClick={onCreate}>
            <Plus size={16} />
            <span>تسجيل شكوى جديدة</span>
          </button>
        )}
      </div>
    </div>
  );
}
