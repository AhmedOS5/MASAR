"use client";

import React, { useState } from "react";
import { BellOff } from "lucide-react";
import NotificationsHeader from "./_components/NotificationsHeader";
import NotificationItem from "./_components/NotificationItem";
import styles from "./notifications.module.css";
import ui from "@/components/ui/ui.module.css";
import dashboardStyles from "../dashboard.module.css";
import { useNotifications } from "../_context/NotificationsContext";
import { ErrorBanner, Skeleton } from "@/components/ui/QueryState";

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "unread", label: "غير مقروء" },
  { key: "alerts", label: "تحذيرات" },
  { key: "tasks", label: "مهام" },
];

export default function NotificationsPage() {
  const { notifications, unreadCount, handleMarkAllRead, handleRead, isLoading, isError, error, refetch } = useNotifications();
  const [activeFilter, setActiveFilter] = useState("all");

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === "unread") return !n.isRead;
    if (activeFilter === "alerts") return n.type === "alert";
    if (activeFilter === "tasks") return n.type === "task";
    return true; // all
  });

  return (
    <main className={dashboardStyles.mainContainer}>
      <NotificationsHeader 
        unreadCount={unreadCount} 
        onMarkAllRead={handleMarkAllRead} 
      />

      <div className={styles.contentLayout}>
        <div className={ui.segmented} role="group" aria-label="تصفية الإشعارات">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${ui.segment} ${activeFilter === f.key ? ui.segmentActive : ""}`}
              aria-pressed={activeFilter === f.key}
              onClick={() => setActiveFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={styles.notificationsList}>
          {isLoading ? (
            <Skeleton rows={4} block />
          ) : isError ? (
            <ErrorBanner error={error} onRetry={refetch} />
          ) : filteredNotifications.length > 0 ? (
            filteredNotifications.map(notification => (
              <NotificationItem 
                key={notification.id} 
                notification={notification} 
                onRead={handleRead}
              />
            ))
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <BellOff size={32} />
              </div>
              <h3 className={styles.emptyTitle}>لا توجد إشعارات</h3>
              <p className={styles.emptyText}>أنت على اطلاع دائم، ليس لديك إشعارات جديدة في هذا القسم.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
