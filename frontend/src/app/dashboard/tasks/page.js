"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { TaskFilters } from "./_components/TaskFilters";
import { TasksTable } from "./_components/TasksTable";
import TaskFormModal from "@/features/tasks/TaskFormModal";
import useDebounce from "@/hooks/useDebounce";
import usePermissions from "@/hooks/usePermissions";
import { listTasks } from "@/services/tasks.service";
import styles from "./tasks.module.css";
import dashboardStyles from "../dashboard.module.css";

const PER_PAGE = 10;

function TasksContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { can } = usePermissions();
  const [filters, setFilters] = useState({ assignee_id: "all", department: "all", priority: "all", status: "all", search: "" });
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(sp.get("new") === "1");
  const search = useDebounce(filters.search);

  const params = { ...filters, search, page, per_page: PER_PAGE };
  const query = useQuery({
    queryKey: ["tasks", params],
    queryFn: () => listTasks(params),
    placeholderData: keepPreviousData,
  });

  const change = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const closeCreate = () => {
    setCreateOpen(false);
    if (sp.get("new")) router.replace("/dashboard/tasks");
  };

  const total = query.data?.meta?.total;

  return (
    <main className={`${dashboardStyles.mainContainer} ${styles.tasksContainer} ${styles.fadeInAnimation}`}>
      <div className={styles.tasksHeader}>
        <div className={styles.headerLeft}>
          {can("tasks.create") && (
            <button type="button" className={styles.addTaskBtn} onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              <span>إضافة مهمة جديدة</span>
            </button>
          )}
        </div>

        <div className={styles.headerRight}>
          <div className={styles.titleRow}>
            {total != null && <span className={styles.countBadge}>{total} مهمة</span>}
            <h1 className={styles.mainTitle}>المهام</h1>
          </div>
          <p className={styles.subTitle}>إدارة ومتابعة المهام المسندة لفريق العمل في MASAR</p>
        </div>
      </div>

      <TaskFilters filters={filters} onChange={change} />
      <TasksTable query={query} page={page} onPageChange={setPage} />

      {createOpen && <TaskFormModal open onClose={closeCreate} />}
    </main>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksContent />
    </Suspense>
  );
}
