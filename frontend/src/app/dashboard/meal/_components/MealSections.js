"use client";

import React from "react";
import Link from "next/link";
import {
  BarChart3,
  MapPin,
  MessageSquare,
  FileText,
  ChevronLeft,
} from "lucide-react";
import styles from "./MealSections.module.css";

export default function MealSections() {
  // Static navigation tiles to the MEAL sub-screens (routing config, not data) — RTL design order
  const SECTIONS = [
    {
      title: "التقارير",
      description: "إنشاء ومراجعة تقارير MEAL",
      href: "/dashboard/meal/reports",
      icon: FileText,
      colorClass: "purple",
    },
    {
      title: "الشكاوى والتغذية الراجعة",
      description: "متابعة الشكاوى وحالات المعالجة",
      href: "/dashboard/meal/complaints",
      icon: MessageSquare,
      colorClass: "amber",
    },
    {
      title: "إدخال البيانات الميدانية",
      description: "تسجيل الأنشطة وربطها بالمؤشرات",
      href: "/dashboard/meal/field-data",
      icon: MapPin,
      colorClass: "blue",
    },
    {
      title: "الإطار المنطقي والمؤشرات",
      description: "متابعة المستهدف والفعلي ونسبة الإنجاز",
      href: "/dashboard/meal/indicators",
      icon: BarChart3,
      colorClass: "green",
    },
  ];

  return (
    <div className={styles.sectionsBlock}>
      <h3 className={styles.blockTitle}>الأقسام</h3>

      <div className={styles.cardsGrid}>
        {SECTIONS.map((section, idx) => {
          const Icon = section.icon;
          return (
            <div key={idx} className={styles.sectionCard}>
              <div
                className={`${styles.iconBox} ${styles[`${section.colorClass}Icon`]}`}
              >
                <Icon size={20} />
              </div>

              <h4 className={styles.sectionTitle}>{section.title}</h4>
              <p className={styles.sectionDesc}>{section.description}</p>

              <Link
                href={section.href}
                className={`${styles.openBtn} ${styles[`${section.colorClass}Btn`]}`}
              >
                <ChevronLeft size={14} />
                <span>فتح</span>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
