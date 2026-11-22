"use client";

import React, { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import MealTopNav from "../_components/MealTopNav";
import ComplaintsHeader from "./_components/ComplaintsHeader";
import ComplaintsAlert from "./_components/ComplaintsAlert";
import ComplaintsStats from "./_components/ComplaintsStats";
import ComplaintsToolbar from "./_components/ComplaintsToolbar";
import ComplaintsTable from "./_components/ComplaintsTable";
import ComplaintsSidePanel from "./_components/ComplaintsSidePanel";
import ComplaintFormModal from "@/features/meal/ComplaintFormModal";
import useDebounce from "@/hooks/useDebounce";
import { listComplaints } from "@/services/meal.service";
import styles from "./complaints.module.css";
import dashStyles from "../../dashboard.module.css";

const PER_PAGE = 10;
const INITIAL = { status: "all", project_id: "all", region: "all", priority: "all", search: "" };

export default function ComplaintsPage() {
  const [filters, setFilters] = useState(INITIAL);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const search = useDebounce(filters.search);

  const params = { ...filters, search, page, per_page: PER_PAGE };
  const query = useQuery({
    queryKey: ["meal", "complaints", params],
    queryFn: () => listComplaints(params),
    placeholderData: keepPreviousData,
  });

  const apply = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <main className={`${dashStyles.mainContainer} ${dashStyles.fadeInAnimation}`}>
      <MealTopNav />
      <ComplaintsHeader onCreate={() => setCreateOpen(true)} />
      <ComplaintsAlert onShowSensitive={() => apply({ status: "sensitive" })} />
      <ComplaintsStats />
      <ComplaintsToolbar filters={filters} onChange={apply} total={query.data?.meta?.total} />

      <div className={styles.contentRow}>
        <ComplaintsTable query={query} page={page} onPageChange={setPage} />
        <ComplaintsSidePanel onApply={apply} />
      </div>

      <ComplaintFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </main>
  );
}
