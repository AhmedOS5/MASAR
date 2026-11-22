"use client";

import React, { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import MealTopNav from "../_components/MealTopNav";
import ReportsHeader from "./_components/ReportsHeader";
import ReportsStats from "./_components/ReportsStats";
import ReportsToolbar from "./_components/ReportsToolbar";
import ReportsTable from "./_components/ReportsTable";
import ReportsSidePanel from "./_components/ReportsSidePanel";
import { ReportFormModal, TemplatesDialog } from "@/features/meal/ReportModals";
import useDebounce from "@/hooks/useDebounce";
import { listMealReports } from "@/services/meal.service";
import styles from "./reports.module.css";
import dashStyles from "../../dashboard.module.css";

const PER_PAGE = 10;
const INITIAL = { status: "all", project_id: "all", type: "all", period: "all", search: "" };

export default function MealReportsPage() {
  const [filters, setFilters] = useState(INITIAL);
  const [page, setPage] = useState(1);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [form, setForm] = useState(null); // null | { initial? }
  const search = useDebounce(filters.search);

  const params = { ...filters, search, page, per_page: PER_PAGE };
  const query = useQuery({
    queryKey: ["meal", "reports", params],
    queryFn: () => listMealReports(params),
    placeholderData: keepPreviousData,
  });

  const apply = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <main className={`${dashStyles.mainContainer} ${dashStyles.fadeInAnimation}`}>
      <MealTopNav />
      <ReportsHeader onTemplates={() => setTemplatesOpen(true)} onCreate={() => setForm({})} />
      <ReportsStats />
      <ReportsToolbar filters={filters} onChange={apply} total={query.data?.meta?.total} />

      <div className={styles.contentRow}>
        <ReportsTable query={query} page={page} onPageChange={setPage} />
        <ReportsSidePanel onApply={apply} />
      </div>

      <TemplatesDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onUse={(template) => {
          setTemplatesOpen(false);
          setForm({ initial: template });
        }}
      />
      {form && <ReportFormModal open initial={form.initial} onClose={() => setForm(null)} />}
    </main>
  );
}
