"use client";

import React from "react";
import Link from "next/link";
import { MapPin, MessageSquare, FileText } from "lucide-react";
import TodayDate from "@/components/ui/TodayDate";
import usePermissions from "@/hooks/usePermissions";
import styles from "./MealHeader.module.css";

export default function MealHeader() {
  const { can } = usePermissions();
  return (
    <div className={styles.bannerContainer}>
      {/* جهة اليمين: عنوان الوحدة والوصف */}
      <div className={styles.rightSection}>
        <h1 className={styles.mealTitle}>M.E.A.L</h1>
        <h2 className={styles.mealSubtitle}>
          المتابعة والتقييم والمساءلة والتعلّم
        </h2>
        <p className={styles.mealDesc}>
          تابع المؤشرات، الأنشطة الميدانية، الشكاوى، والتقارير من مكان واحد.
        </p>
        <div className={styles.updateInfo}>
          <span className={styles.liveDot}></span>
          <span>آخر تحديث</span>
          <span className={styles.separator}>•</span>
          <span><TodayDate options={{ weekday: "long", day: "numeric", month: "long", year: "numeric" }} /></span>
        </div>
      </div>

      {/* جهة اليسار: أزرار الإجراءات السريعة المرتبطة بشاشات الوحدة */}
      <div className={styles.leftSection}>
        <Link href="/dashboard/meal/field-data" className={styles.actionBtn}>
          <MapPin size={15} />
          <span>تسجيل نشاط ميداني</span>
        </Link>
        {can("meal.manage") && (
          <Link href="/dashboard/meal/complaints" className={styles.actionBtn}>
            <MessageSquare size={15} />
            <span>إضافة شكوى</span>
          </Link>
        )}
        {can("meal.manage") && (
          <Link href="/dashboard/meal/reports" className={styles.actionBtn}>
            <FileText size={15} />
            <span>إنشاء تقرير</span>
          </Link>
        )}
      </div>
    </div>
  );
}
