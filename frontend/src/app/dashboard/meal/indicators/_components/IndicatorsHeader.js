"use client";

import React, { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Upload } from "lucide-react";
import { importIndicators, indicatorsExportUrl } from "@/services/meal.service";
import { useToast } from "@/components/Toast/ToastProvider";
import usePermissions from "@/hooks/usePermissions";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";

export default function IndicatorsHeader({ onCreate }) {
  const fileRef = useRef(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = usePermissions();

  const importMutation = useMutation({
    mutationFn: importIndicators,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal"] });
      toast.success("تم استيراد المؤشرات.");
    },
  });

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (file) importMutation.mutate(file);
    e.target.value = "";
  };

  return (
    <PageHeader
      title="الإطار المنطقي والمؤشرات"
      badge={<span className={`${ui.badge} ${ui.badge_info}`}>إطار منطقي ومؤشرات</span>}
      subtitle="تابع مؤشرات المشاريع، القيم المستهدفة، القيم المحققة، ونسبة الإنجاز لكل مشروع. تساعد المؤشرات فريق MEAL على معرفة ما إذا كانت المشاريع تسير حسب الخطة."
      secondary={
        <>
          <button type="button" className={ui.secondaryBtn} disabled={importMutation.isPending} onClick={() => fileRef.current?.click()}>
            <Upload size={15} aria-hidden="true" />
            <span>{importMutation.isPending ? "جاري الاستيراد..." : "استيراد مؤشرات"}</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={onFile} />
          <a className={ui.secondaryBtn} href={indicatorsExportUrl} download>
            <Download size={15} aria-hidden="true" />
            <span>تصدير البيانات</span>
          </a>
        </>
      }
      primary={
        can("meal.manage") && (
          <button type="button" className={ui.primaryBtn} onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            <span>إضافة مؤشر</span>
          </button>
        )
      }
    />
  );
}
