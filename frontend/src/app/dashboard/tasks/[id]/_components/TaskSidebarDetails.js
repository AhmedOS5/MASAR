"use client";

import React from "react";
import { CheckCircle } from "lucide-react";
import useTaskMutations from "@/features/tasks/useTaskMutations";
import { TASK_STATUS, PRIORITY, pick } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import styles from "../taskDetail.module.css";

export function TaskSidebarDetails({ task }) {
  const m = useTaskMutations(task.id);
  const progress = Math.max(0, Math.min(100, Number(task.progress ?? 0)));
  const assignee = task.assignee
    ? `${task.assignee.name}${task.assignee.role ? ` (${task.assignee.role})` : ""}`
    : null;

  const details = [
    { label: "المسؤول", value: assignee },
    { label: "الموعد النهائي", value: task.due_date ? formatDate(task.due_date) : null },
    { label: "أنشأها", value: task.creator?.name ?? task.creator_name },
    { label: "القسم", value: task.department },
    { label: "الأولوية", value: pick(PRIORITY, task.priority).label },
    { label: "الحالة", value: pick(TASK_STATUS, task.status).label },
  ];

  return (
    <>
      <div className={styles.detailCard}>
        <h3 className={styles.sectionTitle}>تفاصيل المهمة</h3>
        <div className={styles.detailsList}>
          {details.map((item) => (
            <div key={item.label} className={styles.detailItem}>
              <span className={styles.detailValue}>{item.value || "—"}</span>
              <span className={styles.detailLabel}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.detailCard}>
        <div className={styles.progressHeader}>
          <span className={styles.progressPercent}>{progress}%</span>
          <h3 className={styles.sectionTitle} style={{ margin: 0 }}>التقدم</h3>
        </div>
        <div className={styles.progressBarBg}>
          <div className={styles.progressBarFill} style={{ width: `${progress}%` }} />
        </div>

        <button
          type="button"
          className={styles.completeTaskBtn}
          disabled={task.status === "done" || m.update.isPending}
          onClick={() => m.update.mutate({ status: "done", progress: 100 })}
        >
          <CheckCircle size={16} />
          <span>{task.status === "done" ? "المهمة مكتملة" : "تحديد كمكتمل"}</span>
        </button>
      </div>
    </>
  );
}
