"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import ui from "@/components/ui/ui.module.css";
import CreateRequestModal from "@/features/requests/CreateRequestModal";
import TaskFormModal from "@/features/tasks/TaskFormModal";
import usePermissions from "@/hooks/usePermissions";
import { listRequests } from "@/services/requests.service";
import { listTasks } from "@/services/tasks.service";
import { PRIORITY, REQUEST_STATUS, TASK_STATUS } from "@/lib/labels";
import styles from "@/app/dashboard/projects/projects.module.css";

const TONE = { wait: "warning", progress: "info", success: "success", done: "success", reject: "danger", draft: "neutral" };
const badge = (map, code) => {
  const s = map[code] ?? { label: code, tone: "draft" };
  return <span className={`${ui.badge} ${ui[`badge_${TONE[s.tone] ?? "neutral"}`]}`}>{s.label}</span>;
};

/** A project's requests and tasks (a request/task made here belongs to the project and to its team only). */
export default function ProjectWork({ project }) {
  const { can } = usePermissions();
  const [modal, setModal] = useState(null); // "request" | "task"
  const params = { project_id: project.id, per_page: 20 };
  const requests = useQuery({ queryKey: ["requests", params], queryFn: () => listRequests(params), enabled: can("requests.view") });
  const tasks = useQuery({ queryKey: ["tasks", params], queryFn: () => listTasks(params), enabled: can("tasks.view") });
  const team = (project.members ?? []).map((m) => ({ value: m.user_id, label: m.name }));

  return (
    <div className={styles.panel}>
      {can("requests.view") && (
        <section className={styles.panel} aria-label="طلبات المشروع">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>الطلبات</h2>
            {can("requests.create") && (
              <button type="button" className={ui.secondaryBtn} onClick={() => setModal("request")}>
                <Plus size={14} aria-hidden="true" /> طلب جديد في المشروع
              </button>
            )}
          </div>
          <QueryState query={requests} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد طلبات في هذا المشروع بعد.">
            {({ items }) => (
              <ul className={styles.list}>
                {items.map((r) => (
                  <li key={r.id} className={styles.row}>
                    <Link href={`/dashboard/requests/${r.id}`} className={`${styles.rowMain} ${styles.rowLink}`}>
                      <span className={styles.rowTitle}>{r.title}</span>
                      <span className={styles.rowSub}>{r.code} · {r.requester?.name}</span>
                    </Link>
                    {badge(REQUEST_STATUS, r.status)}
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </section>
      )}

      {can("tasks.view") && (
        <section className={styles.panel} aria-label="مهام المشروع">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>المهام والتكليفات</h2>
            {can("tasks.create") && (
              <button type="button" className={ui.secondaryBtn} onClick={() => setModal("task")}>
                <Plus size={14} aria-hidden="true" /> مهمة جديدة في المشروع
              </button>
            )}
          </div>
          <QueryState query={tasks} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد مهام في هذا المشروع بعد.">
            {({ items }) => (
              <ul className={styles.list}>
                {items.map((t) => (
                  <li key={t.id} className={styles.row}>
                    <Link href={`/dashboard/tasks/${t.id}`} className={`${styles.rowMain} ${styles.rowLink}`}>
                      <span className={styles.rowTitle}>{t.title}</span>
                      <span className={styles.rowSub}>
                        {t.code} · {t.assignee?.name ?? "بلا مسؤول"} · {PRIORITY[t.priority]?.label ?? t.priority}
                      </span>
                    </Link>
                    {badge(TASK_STATUS, t.status)}
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </section>
      )}

      {modal === "request" && <CreateRequestModal open onClose={() => setModal(null)} projectId={project.id} />}
      {modal === "task" && <TaskFormModal open onClose={() => setModal(null)} projectId={project.id} assignees={team} />}
    </div>
  );
}
