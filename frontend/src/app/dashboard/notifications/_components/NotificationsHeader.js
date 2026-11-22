"use client";

import React from "react";
import { Bell, CheckSquare } from "lucide-react";
import styles from "../notifications.module.css";

export default function NotificationsHeader({ unreadCount, onMarkAllRead }) {
  return (
    <div className={styles.headerWrapper}>
      <div className={styles.titleGroup}>
        <div className={styles.headerIcon}>
          <Bell size={24} />
        </div>
        <div>
          <h1 className={styles.pageTitle}>مركز الإشعارات</h1>
          <p className={styles.pageSubtitle}>
            لديك {unreadCount} إشعارات غير مقروءة
          </p>
        </div>
      </div>
      <div className={styles.headerActions}>
        <button type="button" className={`${styles.actionBtn} ${styles.markReadBtn}`} onClick={onMarkAllRead} disabled={unreadCount === 0}>
          <CheckSquare size={18} />
          تحديد الكل كمقروء
        </button>
      </div>
    </div>
  );
}
