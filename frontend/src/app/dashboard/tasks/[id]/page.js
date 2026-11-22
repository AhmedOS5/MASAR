"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { TaskSummary } from "./_components/TaskSummary";
import { TaskSidebarDetails } from "./_components/TaskSidebarDetails";
import { TaskComments } from "./_components/TaskComments";
import { TaskAttachments } from "./_components/TaskAttachments";
import QueryState from "@/components/ui/QueryState";
import { getTask } from "@/services/tasks.service";
import styles from "./taskDetail.module.css";
import dashboardStyles from "../../dashboard.module.css";

export default function TaskDetailPage({ params }) {
  const { id: taskId } = React.use(params);
  const query = useQuery({ queryKey: ["task", taskId], queryFn: () => getTask(taskId) });

  return (
    <main className={`${dashboardStyles.mainContainer} ${styles.mainContainer} ${styles.fadeInAnimation}`}>
      <div className={styles.backHeader}>
        <Link href="/dashboard/tasks" className={styles.backLink}>
          <span>العودة إلى لوحة المهام</span>
          <ChevronLeft size={16} />
        </Link>
      </div>

      <QueryState query={query} rows={6} block>
        {(task) => (
          <div className={styles.detailLayout}>
            <div className={styles.contentColumn}>
              <TaskSummary task={task} />
              <TaskComments task={task} />
            </div>
            <div className={styles.sidebarColumn}>
              <TaskSidebarDetails task={task} />
              <TaskAttachments task={task} />
            </div>
          </div>
        )}
      </QueryState>
    </main>
  );
}
