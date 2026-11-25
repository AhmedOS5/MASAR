"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import styles from "./TopHeader.module.css";

// Route segment -> label (the same names the sidebar uses). Anything else (a record id) is a detail page.
const LABELS = {
  dashboard: "لوحة التحكم",
  units: "الوحدات",
  meal: "المتابعة والتقييم",
  complaints: "الشكاوى",
  "field-data": "البيانات الميدانية",
  indicators: "المؤشرات",
  reports: "التقارير",
  requests: "الطلبات",
  tasks: "المهام",
  employees: "الموظفون",
  roles: "الأدوار والصلاحيات",
  files: "الملفات",
  notifications: "الإشعارات",
  projects: "المشاريع",
  settings: "إعدادات القوائم",
  account: "حسابي",
};

/** "لوحة التحكم ‹ الطلبات ‹ التفاصيل" from the current path; every step but the last is a link. */
export default function Breadcrumbs() {
  const pathname = usePathname() || "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "dashboard") return null;
  const crumbs = segments.map((seg, i) => ({
    href: `/${segments.slice(0, i + 1).join("/")}`,
    label: LABELS[seg] ?? "التفاصيل",
  }));

  return (
    <nav className={styles.breadcrumbs} aria-label="مسار التنقل">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href}>
              {i > 0 && <ChevronLeft size={14} aria-hidden="true" />}
              {last ? <span aria-current="page">{c.label}</span> : <Link href={c.href}>{c.label}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
