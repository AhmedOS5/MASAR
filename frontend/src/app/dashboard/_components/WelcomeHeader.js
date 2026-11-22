"use client";

import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import useSession from "@/hooks/useSession";
import usePermissions from "@/hooks/usePermissions";
import TodayDate from "@/components/ui/TodayDate";
import styles from "./WelcomeHeader.module.css";

export default function WelcomeHeader() {
  const { userName, organizationName } = useSession();
  const { can } = usePermissions();

  return (
    <div className={styles.bannerContainer}>
      {/* جهة اليمين: الترحيب والبيانات */}
      <div className={styles.rightSection}>
        <h1 className={styles.welcomeText}>
          أهلاً{userName ? "، " : ""}
          <span className={styles.userName}>{userName}</span> 👋
        </h1>
        <p className={styles.subDetails}>
          {organizationName ? `${organizationName} • ` : ""}
          <TodayDate options={{ weekday: "long", day: "numeric", month: "long", year: "numeric" }} />
        </p>
      </div>

      {/* جهة اليسار: أزرار الإجراءات السريعة */}
      <div className={styles.leftSection}>
        {can("requests.create") && (
          <Link href="/dashboard/requests?new=1" className={styles.primaryBtn}>
            <Plus size={16} />
            <span>طلب جديد</span>
          </Link>
        )}
        {can("tasks.create") && (
          <Link href="/dashboard/tasks?new=1" className={styles.secondaryBtn}>
            <Plus size={16} />
            <span>مهمة جديدة</span>
          </Link>
        )}
      </div>
    </div>
  );
}
