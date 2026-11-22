"use client";

import React, { useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import useSession from "@/hooks/useSession";
import useLogout from "@/hooks/useLogout";
import ThemeToggle from "@/components/ui/ThemeToggle";
import StatsCards from "./_components/StatsCards";
import OrganizationsPanel from "./_components/OrganizationsPanel";
import OrganizationReview from "./_components/OrganizationReview";
import DecisionDialog from "./_components/DecisionDialog";
import CliCommands from "./_components/CliCommands";
import styles from "./operator.module.css";

/**
 * The platform operator console. Operators are staff of the platform itself and belong to no organization, so the
 * workspace (dashboard) has nothing for them — every business API answers 403. Here they see platform-wide figures and
 * review, approve, reject, suspend or re-activate organizations (backend: /platform/*, platform admins only).
 */
export default function OperatorPage() {
  const { userName } = useSession();
  const logout = useLogout();
  const [reviewId, setReviewId] = useState(null);
  const [decision, setDecision] = useState(null); // null | { organization, kind }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <span className={styles.brandName}>مسار</span>
          <span className={styles.brandTag}>وحدة تحكم المنصة</span>
        </div>
        <div className={styles.topbarEnd}>
          <ThemeToggle />
          {userName && <span className={styles.userChip}>{userName}</span>}
          <button type="button" className={styles.logout} onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.pageHead}>
          <h1 className={styles.title}>حساب مشغّل المنصة</h1>
          <p className={styles.lead}>
            {userName ? `أهلاً ${userName}. ` : ""}
            راجع طلبات المؤسسات الجديدة واعتمدها، وتابع حالة المنصة من مكان واحد. هذا الحساب تابع لفريق منصة مسار وليس
            عضواً في مؤسسة.
          </p>
        </div>

        <StatsCards />
        <OrganizationsPanel onReview={setReviewId} onDecide={setDecision} />
        <CliCommands />
      </main>

      {/* Escape reaches both dialogs: while a decision is open, only the decision closes. */}
      <OrganizationReview id={reviewId} onClose={() => !decision && setReviewId(null)} onDecide={setDecision} />
      <DecisionDialog decision={decision} onClose={() => setDecision(null)} />
    </div>
  );
}
