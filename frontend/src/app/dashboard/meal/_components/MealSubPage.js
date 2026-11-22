"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Hammer } from "lucide-react";
import styles from "./MealSubPage.module.css";

/* قالب موحّد لشاشات وحدة MEAL الفرعية — يُستبدل محتواه عند بناء كل شاشة بالتفصيل */
export default function MealSubPage({ title, description, icon: Icon, colorClass }) {
  return (
    <div className={styles.subPageContainer}>
      <div className={styles.pageHeader}>
        <Link href="/dashboard/meal" className={styles.backLink}>
          <ArrowRight size={15} />
          <span>العودة إلى لوحة MEAL</span>
        </Link>

        <div className={styles.titleRow}>
          <div className={`${styles.iconBox} ${styles[colorClass]}`}>
            <Icon size={22} />
          </div>
          <div className={styles.titleBlock}>
            <h2 className={styles.pageTitle}>{title}</h2>
            <p className={styles.pageSubtitle}>{description}</p>
          </div>
        </div>
      </div>

      <div className={styles.placeholderCard}>
        <Hammer size={28} className={styles.placeholderIcon} />
        <h3 className={styles.placeholderTitle}>هذه الشاشة قيد البناء</h3>
        <p className={styles.placeholderText}>
          تم تجهيز المسار والربط مع لوحة المتابعة والتقييم، وسيتم إضافة المحتوى
          التفصيلي لهذا القسم قريباً.
        </p>
      </div>
    </div>
  );
}
