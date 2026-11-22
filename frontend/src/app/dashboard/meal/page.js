"use client";

import React from "react";
import MealTopNav from "./_components/MealTopNav";
import MealHeader from "./_components/MealHeader";
import MealStats from "./_components/MealStats";
import MealCharts from "./_components/MealCharts";
import MealSections from "./_components/MealSections";
import MealActivityTable from "./_components/MealActivityTable";
import styles from "../dashboard.module.css";

export default function MealDashboardPage() {
  return (
    <main className={`${styles.mainContainer} ${styles.fadeInAnimation}`}>
      {/* 0. شريط التبويبات العلوي لوحدة المتابعة والتقييم */}
      <MealTopNav />

      {/* 1. البانر الأخضر التعريفي لوحدة المتابعة والتقييم M.E.A.L */}
      <MealHeader />

      {/* 2. كروت المؤشرات الستة (المستفيدون، الإنجاز، المؤشرات المتأخرة، الشكاوى، التقارير، المشاريع) */}
      <MealStats />

      {/* 3. الرسوم البيانية: المستهدف مقابل الفعلي + توزيع المستفيدين */}
      <MealCharts />

      {/* 4. كروت الأقسام الأربعة المرتبطة بشاشات الوحدة الفرعية */}
      <MealSections />

      {/* 5. جدول آخر الأنشطة والشكاوى */}
      <MealActivityTable />
    </main>
  );
}
