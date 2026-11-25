"use client";

import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import useSession from "@/hooks/useSession";
import usePermissions from "@/hooks/usePermissions";
import TodayDate from "@/components/ui/TodayDate";
import styles from "./WelcomeHeader.module.css";

/** Compact page header of the dashboard: greeting + organization + today's date, and the create actions the user may use. */
export default function WelcomeHeader() {
  const { userName, organizationName } = useSession();
  const { can } = usePermissions();

  return (
    <header className={styles.header}>
      <div className={styles.intro}>
        <h1 className={styles.title}>
          أهلاً{userName ? "، " : ""}
          <span className={styles.userName}>{userName}</span>
        </h1>
        <p className={styles.meta}>
          {organizationName ? `${organizationName} • ` : ""}
          <TodayDate options={{ weekday: "long", day: "numeric", month: "long", year: "numeric" }} />
        </p>
      </div>

      <div className={styles.actions}>
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
    </header>
  );
}
