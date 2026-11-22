"use client";

import React from "react";
import { REQUEST_STATUS, PRIORITY, pick } from "@/lib/labels";
import { formatMoney } from "@/lib/format";
import styles from "../requestDetail.module.css";

export function RequestSummary({ request }) {
  const st = pick(REQUEST_STATUS, request.status);
  const pr = pick(PRIORITY, request.priority);
  return (
    <div className={styles.detailCard}>
      <div className={styles.summaryHeader}>
        <span className={styles.idBadge}>{request.code ?? request.id}</span>
        <span className={`${styles.badge} ${styles[`status_${st.tone}`] || ""}`}>{st.label}</span>
        <span className={`${styles.badge} ${styles[`prio_${pr.tone}`] || ""}`}>{pr.label}</span>
      </div>

      <h1 className={styles.requestTitle}>{request.title}</h1>
      <p className={styles.requestSubtitle}>
        {[request.type, request.department && `قسم ${request.department}`].filter(Boolean).join(" · ")}
        {request.amount != null && ` · ${formatMoney(request.amount)}`}
      </p>

      {request.description && <p className={styles.requestDescription}>{request.description}</p>}
    </div>
  );
}
