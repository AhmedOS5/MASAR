"use client";

import React, { useState } from "react";
import MealTopNav from "../_components/MealTopNav";
import FieldDataHeader from "./_components/FieldDataHeader";
import FieldDataForm from "./_components/FieldDataForm";
import FieldDataSummary from "./_components/FieldDataSummary";
import FieldDataRecent from "./_components/FieldDataRecent";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/QueryState";
import useFieldRecordForm from "@/features/meal/useFieldRecordForm";
import usePermissions from "@/hooks/usePermissions";
import styles from "./field-data.module.css";
import dashStyles from "../../dashboard.module.css";

export default function FieldDataPage() {
  const form = useFieldRecordForm();
  const { can } = usePermissions();
  const [showAll, setShowAll] = useState(false);

  const openRecords = () => {
    setShowAll(true);
    document.getElementById("field-recent")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className={`${dashStyles.mainContainer} ${dashStyles.fadeInAnimation}`}>
      <MealTopNav />
      <FieldDataHeader form={form} onShowRecords={openRecords} canEdit={can("meal.manage")} />

      {can("meal.manage") ? (
        <div className={styles.contentRow}>
          <FieldDataForm form={form} />
          <FieldDataSummary form={form} />
        </div>
      ) : (
        <EmptyState icon={Lock}>تسجيل البيانات الميدانية متاح لمسؤولي المتابعة والتقييم فقط. يمكنك الاطلاع على السجلات السابقة أدناه.</EmptyState>
      )}

      <FieldDataRecent showAll={showAll} onToggle={() => setShowAll((s) => !s)} />
    </main>
  );
}
