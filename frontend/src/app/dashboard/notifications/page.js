"use client";

import React, { useState } from "react";
import { BellOff } from "lucide-react";
import NotificationsHeader from "./_components/NotificationsHeader";
import NotificationItem from "./_components/NotificationItem";
import styles from "./notifications.module.css";
import { useNotifications } from "../_context/NotificationsContext";
import { ErrorBanner, Skeleton } from "@/components/ui/QueryState";

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
    <div className={styles.pageContainer}>
      <NotificationsHeader 
        unreadCount={unreadCount} 
        onMarkAllRead={handleMarkAllRead} 
      />

      <div className={styles.contentLayout}>
        <div className={styles.filtersRow}>
          <button 
            className={`${styles.filterChip} ${activeFilter === "all" ? styles.filterChipActive : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            الكل
          </button>
          <button 
            className={`${styles.filterChip} ${activeFilter === "unread" ? styles.filterChipActive : ""}`}
            onClick={() => setActiveFilter("unread")}
          >
            غير مقروء
          </button>
          <button 
            className={`${styles.filterChip} ${activeFilter === "alerts" ? styles.filterChipActive : ""}`}
            onClick={() => setActiveFilter("alerts")}
          >
            تحذيرات
          </button>
          <button 
            className={`${styles.filterChip} ${activeFilter === "tasks" ? styles.filterChipActive : ""}`}
            onClick={() => setActiveFilter("tasks")}
          >
            مهام
          </button>
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
    </div>
  );
}
