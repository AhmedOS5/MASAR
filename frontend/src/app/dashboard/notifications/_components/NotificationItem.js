"use client";

import React from "react";
import Link from "next/link";
import { Info, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import styles from "../notifications.module.css";

export default function NotificationItem({ notification, onRead }) {
  const { id, title, message, time, type, isRead, link } = notification;

  // تحديد الأيقونة واللون بناءً على نوع الإشعار
  const getTypeStyles = () => {
    switch (type) {
      case "alert":
        return { icon: <AlertTriangle size={20} />, className: styles.typeAlert };
      case "task":
        return { icon: <CheckCircle size={20} />, className: styles.typeTask };
      case "system":
      default:
        return { icon: <Info size={20} />, className: styles.typeSystem };
    }
  };

  const { icon, className } = getTypeStyles();

  return (
    <div
      className={styles.notificationCard}
      role="button"
      tabIndex={0}
      onClick={() => !isRead && onRead(id)}
      onKeyDown={(e) => e.key === "Enter" && !isRead && onRead(id)}
    >
      {!isRead && <div className={styles.unreadDot}></div>}
      
      <div className={`${styles.iconWrapper} ${className}`}>
        {icon}
      </div>

      <div className={styles.contentWrapper}>
        <div className={styles.cardHeader}>
          <h4 className={styles.cardTitle}>{title}</h4>
          <span className={styles.cardTime}>
            <Clock size={12} aria-hidden="true" />
            {time}
          </span>
        </div>
        <p className={styles.cardMessage}>{message}</p>
        
        {type === "task" && link && (
          <div className={styles.cardAction}>
            <Link href={link} className={styles.cardBtn} onClick={(e) => e.stopPropagation()}>
              عرض المهمة
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
