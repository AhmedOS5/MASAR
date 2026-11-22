"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import useDashboardSummary from "@/hooks/useDashboardSummary";
import { useNotifications } from "../_context/NotificationsContext";
import { ErrorBanner, EmptyState, Skeleton } from "@/components/ui/QueryState";
import { REQUEST_STATUS, TASK_STATUS, PRIORITY, pick } from "@/lib/labels";
import { formatDate, formatMoney, timeAgo } from "@/lib/format";
import styles from "./ActionPanels.module.css";

const STATUS_CLASS = {
  wait: styles.badgeWait,
  success: styles.badgeSuccess,
  progress: styles.badgeProgress,
  done: styles.badgeSuccess,
  reject: styles.badgeWait,
  draft: styles.badgeWait,
};
const PRIO_CLASS = {
  urgent: styles.prioUrgent,
  high: styles.prioHigh,
  medium: styles.prioMedium,
  low: styles.prioLow,
};

function Panel({ title, href, children }) {
  return (
    <div className={styles.panelCard}>
      <div className={styles.panelHeader}>
        <Link href={href} className={styles.viewAllLink}>
          <span>عرض الكل</span>
          <ArrowLeft size={12} />
        </Link>
        <h3 className={styles.panelTitle}>{title}</h3>
      </div>
      <div className={styles.panelList}>{children}</div>
    </div>
  );
}

export default function ActionPanels() {
  const query = useDashboardSummary();
  const { notifications, unreadCount } = useNotifications();

  if (query.isPending) return <Skeleton rows={4} block />;
  if (query.isError) return <ErrorBanner error={query.error} onRetry={() => query.refetch()} />;

  const { pending_approvals = [], recent_requests = [], open_tasks = [] } = query.data || {};

  return (
    <div className={styles.panelsContainer}>
      <div className={styles.rightColumn}>
        <Panel title="بانتظار الموافقة" href="/dashboard/requests?status=pending">
          {pending_approvals.length === 0 && <EmptyState>لا توجد طلبات بانتظار الموافقة.</EmptyState>}
          {pending_approvals.map((r) => (
            <Link key={r.id} href={`/dashboard/requests/${r.id}`} className={styles.rowItem}>
              <div className={styles.priceTag}>{formatMoney(r.amount)}</div>
              <div className={styles.itemMeta}>
                <span className={styles.itemMainText}>{r.title}</span>
                <span className={styles.itemSubText}>
                  {r.department} • {timeAgo(r.created_at)}
                </span>
              </div>
            </Link>
          ))}
        </Panel>

        <Panel title="الطلبات الأخيرة" href="/dashboard/requests">
          {recent_requests.length === 0 && <EmptyState>لا توجد طلبات بعد.</EmptyState>}
          {recent_requests.map((r) => {
            const st = pick(REQUEST_STATUS, r.status);
            const pr = pick(PRIORITY, r.priority);
            return (
              <Link key={r.id} href={`/dashboard/requests/${r.id}`} className={styles.rowItemTable}>
                <div className={`${styles.statusBadge} ${STATUS_CLASS[st.tone] || ""}`}>{st.label}</div>
                <div className={`${styles.priorityBadge} ${PRIO_CLASS[pr.tone] || ""}`}>{pr.label}</div>
                <div className={styles.itemMeta}>
                  <span className={styles.itemMainText}>{r.title}</span>
                  <span className={styles.itemSubText}>
                    {r.code} • {formatDate(r.created_at, { day: "numeric", month: "long" })}
                  </span>
                </div>
              </Link>
            );
          })}
        </Panel>
      </div>

      <div className={styles.leftColumn}>
        <Panel title="المهام المفتوحة" href="/dashboard/tasks">
          {open_tasks.length === 0 && <EmptyState>لا توجد مهام مفتوحة.</EmptyState>}
          {open_tasks.map((t) => {
            const st = pick(TASK_STATUS, t.status);
            return (
              <Link key={t.id} href={`/dashboard/tasks/${t.id}`} className={styles.rowItem}>
                <div className={`${styles.statusBadge} ${STATUS_CLASS[st.tone] || ""}`}>{st.label}</div>
                <div className={styles.itemMeta}>
                  <span className={styles.itemMainText}>{t.title}</span>
                  <span className={styles.itemSubText}>
                    {t.assignee} • موعد: {formatDate(t.due_date, { day: "numeric", month: "long" })}
                  </span>
                </div>
              </Link>
            );
          })}
        </Panel>

        <Panel title="الإشعارات الأخيرة" href="/dashboard/notifications">
          {notifications.length === 0 && <EmptyState>لا توجد إشعارات.</EmptyState>}
          {notifications.slice(0, 3).map((n, i) => (
            <div key={n.id} className={styles.notificationItem}>
              {i === 0 && unreadCount > 0 && (
                <span className={styles.notifBadgeCount}>{unreadCount}</span>
              )}
              <div className={styles.itemMeta}>
                <span className={styles.itemMainText}>{n.title}</span>
                <span className={styles.itemSubText}>{n.time}</span>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
