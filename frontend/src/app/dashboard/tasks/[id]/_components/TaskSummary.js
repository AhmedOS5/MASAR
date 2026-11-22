"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Edit3 } from "lucide-react";
import TaskFormModal from "@/features/tasks/TaskFormModal";
import useTaskMutations from "@/features/tasks/useTaskMutations";
import usePermissions from "@/hooks/usePermissions";
import useSession from "@/hooks/useSession";
import { TASK_STATUS, PRIORITY, pick } from "@/lib/labels";
import styles from "../taskDetail.module.css";

export function TaskSummary({ task }) {
  const m = useTaskMutations(task.id);
  const { can } = usePermissions();
  const { user } = useSession();
  // whoever may edit the task changes its status; otherwise only the assignee reports on their own task
  const mayReport = can("tasks.update") || user?.id == null || user.id === task.assignee_id;
  const [editOpen, setEditOpen] = useState(false);
  const st = pick(TASK_STATUS, task.status);
  const pr = pick(PRIORITY, task.priority);

  return (
    <div className={styles.detailCard}>
      <div className={styles.summaryHeader}>
        <div className={styles.headerBadges}>
          <span className={styles.idBadge}>{task.code ?? task.id}</span>
          <span className={`${styles.badge} ${styles[`status_${st.tone}`] || ""}`}>{st.label}</span>
          <span className={`${styles.badge} ${styles[`prio_${pr.tone}`] || ""}`}>{pr.label}</span>
        </div>
        {can("tasks.update") && (
          <button type="button" className={styles.editBtn} onClick={() => setEditOpen(true)}>
            <Edit3 size={14} />
            <span>تعديل</span>
          </button>
        )}
      </div>

      <h1 className={styles.taskTitle}>{task.title}</h1>
      {task.request && (
        <p className={styles.taskSubtitle}>
          مرتبط بـ{" "}
          <Link href={`/dashboard/requests/${task.request.id}`} className={styles.linkedText}>
            {task.request.code} – {task.request.title}
          </Link>
        </p>
      )}

      {task.description && <p className={styles.taskDescription}>{task.description}</p>}

      {mayReport && (
        <div className={styles.statusUpdateSection}>
          <span className={styles.statusSectionTitle}>تحديث الحالة</span>
          <div className={styles.statusButtonsGrid}>
            {Object.entries(TASK_STATUS).map(([code, { label }]) => (
              <button
                key={code}
                type="button"
                disabled={m.update.isPending}
                aria-pressed={task.status === code}
                className={`${styles.statusToggleBtn} ${task.status === code ? styles.activeStatusBtn : ""}`}
                onClick={() => task.status !== code && m.update.mutate({ status: code })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {editOpen && <TaskFormModal open task={task} onClose={() => setEditOpen(false)} />}
    </div>
  );
}
