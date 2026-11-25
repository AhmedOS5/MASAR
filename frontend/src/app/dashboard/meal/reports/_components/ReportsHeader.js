"use client";

import React from "react";
import { Plus, Download, LayoutTemplate } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { mealReportsExportUrl } from "@/services/meal.service";
import usePermissions from "@/hooks/usePermissions";

export default function ReportsHeader({ onTemplates, onCreate }) {
  const { can } = usePermissions();
  return (
    <PageHeader
      title="التقارير"
      subtitle="أنشئ وراجع تقارير المتابعة والتقييم والمساءلة والتعلّم بناءً على بيانات المشاريع."
      secondary={
        <>
          <button type="button" className={ui.secondaryBtn} onClick={onTemplates}>
            <LayoutTemplate size={15} aria-hidden="true" />
            <span>قوالب التقارير</span>
          </button>
          <a className={ui.secondaryBtn} href={mealReportsExportUrl} download>
            <Download size={15} aria-hidden="true" />
            <span>تصدير القائمة</span>
          </a>
        </>
      }
      primary={
        can("meal.manage") && (
          <button type="button" className={ui.primaryBtn} onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            <span>إنشاء تقرير</span>
          </button>
        )
      }
    />
  );
}
