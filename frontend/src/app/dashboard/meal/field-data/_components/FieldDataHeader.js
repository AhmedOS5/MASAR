"use client";

import React from "react";
import { Plus, History, Save } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";

export default function FieldDataHeader({ form, onShowRecords, canEdit = true }) {
  return (
    <PageHeader
      title="إدخال البيانات الميدانية"
      subtitle="سجّل الأنشطة الميدانية وربطها بالمؤشرات والمستفيدين لدعم التقارير. تُستخدم هذه البيانات لتحديث تقدم المؤشرات وإثبات تنفيذ الأنشطة."
      secondary={
        <>
          {canEdit && (
            <button type="button" className={ui.secondaryBtn} disabled={form.saving} onClick={form.saveDraft}>
              <Save size={15} aria-hidden="true" />
              <span>{form.saving ? "جاري الحفظ..." : "حفظ كمسودة"}</span>
            </button>
          )}
          <button type="button" className={ui.secondaryBtn} onClick={onShowRecords}>
            <History size={15} aria-hidden="true" />
            <span>عرض السجلات السابقة</span>
          </button>
        </>
      }
      primary={
        canEdit && (
          <button type="button" className={ui.primaryBtn} onClick={form.reset}>
            <Plus size={16} aria-hidden="true" />
            <span>تسجيل نشاط جديد</span>
          </button>
        )
      }
    />
  );
}
