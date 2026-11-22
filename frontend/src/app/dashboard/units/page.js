"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import UnitsStats from "./_components/UnitsStats";
import UnitsFilter from "./_components/UnitsFilter";
import UnitCard from "./_components/UnitCard";
import UnitDialog from "./_components/UnitDialog";
import { UNIT_FILTERS } from "./_components/unitFilters";
import QueryState from "@/components/ui/QueryState";
import { listUnits } from "@/services/workspace.service";
import styles from "./units.module.css";
import dashStyles from "../dashboard.module.css";

export default function UnitsPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null); // { unit, mode: 'details' | 'setup' }

  const query = useQuery({ queryKey: ["units"], queryFn: listUnits });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data ?? []).filter(
      (u) =>
        UNIT_FILTERS[filter](u) &&
        (!q || `${u.title} ${u.description ?? ""}`.toLowerCase().includes(q)),
    );
  }, [query.data, filter, search]);

  return (
    <main className={`${dashStyles.mainContainer} ${dashStyles.fadeInAnimation}`}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>الوحدات</h2>
        <p className={styles.pageSubtitle}>
          اختر الوحدات المناسبة لاحتياجات مؤسستك وفعلها حسب طبيعة العمل والصلاحيات المطلوبة.
        </p>
      </div>

      <QueryState query={query} isEmpty={(d) => d.length === 0} emptyText="لا توجد وحدات متاحة.">
        {(units) => (
          <>
            <UnitsStats units={units} />
            <UnitsFilter filter={filter} onFilter={setFilter} search={search} onSearch={setSearch} />

            {visible.length === 0 ? (
              <p style={{ color: "#64748b", textAlign: "center", padding: 24 }}>لا توجد وحدات مطابقة.</p>
            ) : (
              <div className={styles.cardsGrid}>
                {visible.map((unit) => (
                  <UnitCard key={unit.id} unit={unit} onOpen={(mode) => setDialog({ unit, mode })} />
                ))}
              </div>
            )}
          </>
        )}
      </QueryState>

      {dialog && <UnitDialog unit={dialog.unit} mode={dialog.mode} onClose={() => setDialog(null)} />}
    </main>
  );
}
