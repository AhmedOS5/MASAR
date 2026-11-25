"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./_components/Sidebar";
import TopHeader from "./_components/TopHeader";
import styles from "./dashboard.module.css";
import { NotificationsProvider } from "./_context/NotificationsContext";
import useSession from "@/hooks/useSession";

const SIDEBAR_KEY = "masar-sidebar";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Desktop icon-rail preference. Read after mount: the page is pre-rendered, so the first render must not depend on storage.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "collapsed");
    } catch {
      /* storage blocked: stay expanded */
    }
  }, []);
  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "open");
    } catch {
      /* the choice still applies for this visit */
    }
  }

  // Platform operators belong to no organization: every business API answers 403 for them. The route guard already keeps
  // them out; this covers a session that began before the operator page existed (its cookie still says "approved").
  const { user } = useSession();
  const isOperator = user?.is_platform_admin === true;
  useEffect(() => {
    if (isOperator) router.replace("/operator");
  }, [isOperator, router]);
  if (isOperator) return null;

  return (
    <NotificationsProvider>
      <TopHeader onMenuClick={() => setIsSidebarOpen(true)} collapsed={collapsed} />
      <div className={styles.dashboardWrapper}>
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
        <div className={`${styles.contentWrapper} ${collapsed ? styles.contentCollapsed : ""}`}>
          {children}
        </div>
      </div>
    </NotificationsProvider>
  );
}
