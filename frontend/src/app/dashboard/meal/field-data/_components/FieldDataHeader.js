"use client";

import React from "react";
import { Plus, History, Save } from "lucide-react";
import styles from "./FieldDataHeader.module.css";

export default function FieldDataHeader({ form, onShowRecords, canEdit = true }) {
  return (
    <div className={styles.headerRow}>
      <div className={styles.titleSide}>
        <div className={styles.titleLine}>
          <h2 className={styles.pageTitle}>إدخال البيانات الميدانية</h2>
          <span className={styles.titleBadge}>إدخال البيانات الميدانية</span>
        </div>
        <p className={styles.subtitle}>
          سجّل الأنشطة الميدانية وربطها بالمؤشرات والمستفيدين لدعم التقارير.
        </p>
        <p className={styles.subtitleMuted}>
          تُستخدم هذه البيانات لتحديث تقدم المؤشرات وإثبات تنفيذ الأنشطة.
        </p>
      </div>

      <div className={styles.actionsSide}>
        {canEdit && (
          <button type="button" className={styles.btnOutline} disabled={form.saving} onClick={form.saveDraft}>
            <Save size={15} />
            <span>{form.saving ? "جاري الحفظ..." : "حفظ كمسودة"}</span>
          </button>
        )}
        <button type="button" className={styles.btnOutline} onClick={onShowRecords}>
          <History size={15} />
          <span>عرض السجلات السابقة</span>
        </button>
        {canEdit && (
          <button type="button" className={styles.btnPrimary} onClick={form.reset}>
            <Plus size={16} />
            <span>تسجيل نشاط جديد</span>
          </button>
        )}
      </div>
    </div>
  );
}
