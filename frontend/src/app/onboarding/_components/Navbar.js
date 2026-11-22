"use client";

import Image from "next/image";
import useSession from "@/hooks/useSession";
import { initialOf } from "@/lib/format";
import styles from "./Navbar.module.css";

export default function Navbar() {
  const { userName, user } = useSession();
  const name = userName || user?.email || "";

  return (
    <nav className={styles.navbar}>
      <div className={styles.navbarInner}>
        {/* الشق الأيمن: الشعار واسم المنصة */}
        <div className={styles.logoSection}>
          <div className={styles.logoIcon}>
            <Image src="/logo.png" alt="شعار مَسَار" width={150} height={150} priority />
          </div>
        </div>

        {/* الشق الأيسر: معلومات حساب المستخدم الحالي */}
        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{name || "…"}</span>
            {user?.role && <span className={styles.userRole}>{user.role}</span>}
          </div>
          <div className={styles.avatar}>{initialOf(name)}</div>
        </div>
      </div>
    </nav>
  );
}
