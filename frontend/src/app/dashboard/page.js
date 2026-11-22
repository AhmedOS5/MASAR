"use client";

import React from "react";
import WelcomeHeader from "./_components/WelcomeHeader";
import StatsGrid from "./_components/StatsGrid";
import WeeklyActivity from "./_components/WeeklyActivity";
import ActionPanels from "./_components/ActionPanels";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  return (
    <main className={`${styles.mainContainer} ${styles.fadeInAnimation}`}>
      <WelcomeHeader />

      <StatsGrid />

      <WeeklyActivity />

      <ActionPanels />
    </main>
  );
}
