"use client";

import React from "react";
import { Bell, CheckSquare } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";

export default function NotificationsHeader({ unreadCount, onMarkAllRead }) {
  return (
    <PageHeader
      icon={Bell}
      title="مركز الإشعارات"
      subtitle={`لديك ${unreadCount} إشعارات غير مقروءة`}
      primary={
        <button type="button" className={ui.secondaryBtn} onClick={onMarkAllRead} disabled={unreadCount === 0}>
          <CheckSquare size={16} aria-hidden="true" />
          تحديد الكل كمقروء
        </button>
      }
    />
  );
}
