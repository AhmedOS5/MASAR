"use client";

import React, { Suspense } from "react";
import FeaturesSection from "./_components/FeaturesSection";
import LoginForm from "./_components/LoginForm";
import styles from "./login-page.module.css";

export default function LoginPage() {
  return (
    <div className={styles.pageContainer}>
      <main className={styles.mainCard}>
        
        {/* الجانب الأيمن: نموذج الدخول */}
        <div className={styles.rightSide}>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        {/* الجانب الأيسر: مميزات النظام (يختفي في الشاشات الصغيرة) */}
        <div className={styles.leftSide}>
          <FeaturesSection />
        </div>

      </main>
    </div>
  );
}
