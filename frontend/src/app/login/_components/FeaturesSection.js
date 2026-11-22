"use client";

import React from "react";
import { ShieldAlert, AppWindow, BarChart3, ShieldCheck } from "lucide-react";
import styles from "./FeaturesSection.module.css";

export default function FeaturesSection() {
  const features = [
    {
      id: 1,
      title: "صلاحيات محمية",
      icon: <ShieldAlert size={20} />,
      colorClass: styles.iconGreen,
      delayClass: styles.delay1,
    },
    {
      id: 2,
      title: "وحدات مفعّلة",
      icon: <AppWindow size={20} />,
      colorClass: styles.iconBlue,
      delayClass: styles.delay2,
    },
    {
      id: 3,
      title: "تقارير ومتابعة",
      icon: <BarChart3 size={20} />,
      colorClass: styles.iconGray,
      delayClass: styles.delay3,
    },
    {
      id: 4,
      title: "مساحة عمل آمنة",
      icon: <ShieldCheck size={20} />,
      colorClass: styles.iconShield,
      delayClass: styles.delay4,
    },
  ];

  return (
    <div className={styles.featuresWrapper}>
      <span className={`${styles.brandTag} ${styles.animateFadeIn}`}>مَسَار</span>
      <h2 className={`${styles.featuresTitle} ${styles.animateFadeIn}`}>مساحة تشغيل ذكية للمؤسسات</h2>
      <p className={`${styles.featuresDescription} ${styles.animateFadeIn}`}>
        ادخل إلى مساحة عمل مؤسستك وتابع الفرق، الوحدات، المهام، والتقارير من
        مكان واحد وبأمان تام.
      </p>

      <div className={styles.featuresList}>
        {features.map((item) => (
          <div key={item.id} className={`${styles.featureRow} ${styles.animateSlideLeft} ${item.delayClass}`}>
            <div className={styles.featureCard}>
              <span>{item.title}</span>
            </div>
            <div className={`${styles.iconBox} ${item.colorClass}`}>
              {item.icon}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
