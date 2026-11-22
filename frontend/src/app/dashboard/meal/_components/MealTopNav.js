"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./MealTopNav.module.css";

// شريط التبويبات العلوي لوحدة المتابعة والتقييم — يظهر أعلى كل شاشات MEAL
const TABS = [
  { label: "لوحة التحكم", href: "/dashboard/meal" },
  { label: "الإطار المنطقي والمؤشرات", href: "/dashboard/meal/indicators" },
  { label: "إدخال البيانات الميدانية", href: "/dashboard/meal/field-data" },
  { label: "الشكاوى والتغذية الراجعة", href: "/dashboard/meal/complaints" },
  { label: "التقارير", href: "/dashboard/meal/reports" },
];

export default function MealTopNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabsBar}>
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/dashboard/meal"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={isActive ? styles.tabActive : styles.tab}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
