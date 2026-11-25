"use client";

import React from "react";
import { Plus, Download } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";
import { complaintsExportUrl } from "@/services/meal.service";
import usePermissions from "@/hooks/usePermissions";

export default function ComplaintsHeader({ onCreate }) {
  const { can } = usePermissions();
  return (
    <PageHeader
      title="الشكاوى والتغذية الراجعة"
      badge={<span className={`${ui.badge} ${ui.badge_info}`}>إدارة المساءلة</span>}
      subtitle="تابع الشكاوى والتغذية الراجعة من المستفيدين لضمان المساءلة وتحسين جودة الخدمات."
      secondary={
        <a className={ui.secondaryBtn} href={complaintsExportUrl} download>
          <Download size={15} aria-hidden="true" />
          <span>تصدير القائمة</span>
        </a>
      }
      primary={
        can("meal.manage") && (
          <button type="button" className={ui.primaryBtn} onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            <span>تسجيل شكوى جديدة</span>
          </button>
        )
      }
    />
  );
}
