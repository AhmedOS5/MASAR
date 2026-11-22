"use client";

import React, { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Upload } from "lucide-react";
import { importIndicators, indicatorsExportUrl } from "@/services/meal.service";
import { useToast } from "@/components/Toast/ToastProvider";
import usePermissions from "@/hooks/usePermissions";
import styles from "./IndicatorsHeader.module.css";

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
    <div className={styles.headerRow}>
      <div className={styles.titleSide}>
        <div className={styles.titleLine}>
          <h2 className={styles.pageTitle}>الإطار المنطقي والمؤشرات</h2>
          <span className={styles.titleBadge}>إطار منطقي ومؤشرات</span>
        </div>
        <p className={styles.subtitle}>
          تابع مؤشرات المشاريع، القيم المستهدفة، القيم المحققة، ونسبة الإنجاز لكل مشروع.
        </p>
        <p className={styles.subtitleMuted}>
          تساعد المؤشرات فريق MEAL على معرفة ما إذا كانت المشاريع تسير حسب الخطة.
        </p>
      </div>

      <div className={styles.actionsSide}>
        <button type="button" className={styles.btnOutline} disabled={importMutation.isPending} onClick={() => fileRef.current?.click()}>
          <Upload size={15} />
          <span>{importMutation.isPending ? "جاري الاستيراد..." : "استيراد مؤشرات"}</span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={onFile} />
        <a className={styles.btnOutline} href={indicatorsExportUrl} download style={{ textDecoration: "none" }}>
          <Download size={15} />
          <span>تصدير البيانات</span>
        </a>
        {can("meal.manage") && (
          <button type="button" className={styles.btnPrimary} onClick={onCreate}>
            <Plus size={16} />
            <span>إضافة مؤشر</span>
          </button>
        )}
      </div>
    </div>
  );
}
