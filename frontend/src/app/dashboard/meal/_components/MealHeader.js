"use client";

import React from "react";
import Link from "next/link";
import { MapPin, MessageSquare, FileText } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";
import TodayDate from "@/components/ui/TodayDate";
import usePermissions from "@/hooks/usePermissions";

export default function MealHeader() {
  const { can } = usePermissions();
  return (
    <PageHeader
      title="M.E.A.L"
      subtitle="المتابعة والتقييم والمساءلة والتعلّم: تابع المؤشرات، الأنشطة الميدانية، الشكاوى، والتقارير من مكان واحد."
      meta={
        <>
          <span>آخر تحديث</span>
          <span aria-hidden="true">•</span>
          <span><TodayDate options={{ weekday: "long", day: "numeric", month: "long", year: "numeric" }} /></span>
        </>
      }
      secondary={
        can("meal.manage") && (
          <>
            <Link href="/dashboard/meal/complaints" className={ui.secondaryBtn}>
              <MessageSquare size={15} aria-hidden="true" />
              <span>إضافة شكوى</span>
            </Link>
            <Link href="/dashboard/meal/reports" className={ui.secondaryBtn}>
              <FileText size={15} aria-hidden="true" />
              <span>إنشاء تقرير</span>
            </Link>
          </>
        )
      }
      primary={
        <Link href="/dashboard/meal/field-data" className={ui.primaryBtn}>
          <MapPin size={15} aria-hidden="true" />
          <span>تسجيل نشاط ميداني</span>
        </Link>
      }
    />
  );
}
