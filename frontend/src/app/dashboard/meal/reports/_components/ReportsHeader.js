"use client";

import React from "react";
import { Plus, Download, LayoutTemplate } from "lucide-react";
import { mealReportsExportUrl } from "@/services/meal.service";
import usePermissions from "@/hooks/usePermissions";
import styles from "./ReportsHeader.module.css";

export default function ReportsHeader({ onTemplates, onCreate }) {
  const { can } = usePermissions();
  return (
    <div className={styles.headerRow}>
      <div className={styles.titleSide}>
        <h2 className={styles.pageTitle}>التقارير</h2>
        <p className={styles.subtitle}>
          أنشئ وراجع تقارير المتابعة والتقييم والمساءلة والتعلّم بناءً على بيانات المشاريع.
        </p>
      </div>

      <div className={styles.actionsSide}>
        <button type="button" className={styles.btnOutline} onClick={onTemplates}>
          <LayoutTemplate size={15} />
          <span>قوالب التقارير</span>
        </button>
        <a className={styles.btnOutline} href={mealReportsExportUrl} download style={{ textDecoration: "none" }}>
          <Download size={15} />
          <span>تصدير القائمة</span>
        </a>
        {can("meal.manage") && (
          <button type="button" className={styles.btnPrimary} onClick={onCreate}>
            <Plus size={16} />
            <span>إنشاء تقرير</span>
          </button>
        )}
      </div>
    </div>
  );
}
