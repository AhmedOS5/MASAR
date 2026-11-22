"use client";

import React, { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import MealTopNav from "../_components/MealTopNav";
import IndicatorsHeader from "./_components/IndicatorsHeader";
import IndicatorsStats from "./_components/IndicatorsStats";
import IndicatorsToolbar from "./_components/IndicatorsToolbar";
import IndicatorsTable from "./_components/IndicatorsTable";
import IndicatorsSidePanel from "./_components/IndicatorsSidePanel";
import { IndicatorFormModal, IndicatorValueModal } from "@/features/meal/IndicatorModals";
import useDebounce from "@/hooks/useDebounce";
import { listIndicators } from "@/services/meal.service";
import styles from "./indicators.module.css";
import dashStyles from "../../dashboard.module.css";

const PER_PAGE = 10;

export default function IndicatorsPage() {
  const [filters, setFilters] = useState({ status: "all", search: "" });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null); // indicator being updated
  const search = useDebounce(filters.search);

  const params = { ...filters, search, page, per_page: PER_PAGE };
  const query = useQuery({
    queryKey: ["meal", "indicators", params],
    queryFn: () => listIndicators(params),
    placeholderData: keepPreviousData,
  });

  const apply = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <main className={`${dashStyles.mainContainer} ${dashStyles.fadeInAnimation}`}>
      <MealTopNav />
      <IndicatorsHeader onCreate={() => setCreateOpen(true)} />
      <IndicatorsStats />
      <IndicatorsToolbar filters={filters} onChange={apply} />

      <div className={styles.contentRow}>
        <IndicatorsTable query={query} page={page} onPageChange={setPage} onEdit={setEditing} />
        <IndicatorsSidePanel onApply={apply} onEdit={setEditing} />
      </div>

      <IndicatorFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editing && <IndicatorValueModal indicator={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}
