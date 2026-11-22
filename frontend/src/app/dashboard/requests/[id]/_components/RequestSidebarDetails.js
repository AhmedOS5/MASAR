"use client";

import React from "react";
import { REQUEST_STATUS, PRIORITY, pick } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import styles from "../requestDetail.module.css";

const ACTIVITY_COLOR = { created: "#059669", reviewed: "#2563eb", pending: "#d97706", rejected: "#db2777" };

export function RequestSidebarDetails({ request }) {
  const details = [
    { label: "مقدم الطلب", value: request.requester?.name ?? request.requester_name },
    { label: "تاريخ التقديم", value: formatDate(request.created_at) },
    { label: "القسم", value: request.department },
    { label: "النوع", value: request.type },
    { label: "الأولوية", value: pick(PRIORITY, request.priority).label },
    { label: "الحالة", value: pick(REQUEST_STATUS, request.status).label },
  ];
  const activities = request.activities ?? [];

  return (
    <>
      <div className={styles.detailCard}>
        <h3 className={styles.sectionTitle}>تفاصيل الطلب</h3>
        <div className={styles.detailsList}>
          {details.map((item) => (
            <div key={item.label} className={styles.detailItem}>
              <span className={styles.detailValue}>{item.value || "—"}</span>
              <span className={styles.detailLabel}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.detailCard}>
        <h3 className={styles.sectionTitle}>سجل النشاط</h3>
        {activities.length === 0 ? (
          <p className={styles.timelineTime}>لا يوجد نشاط مسجّل بعد.</p>
        ) : (
          <div className={styles.timeline}>
            {activities.map((act, idx) => (
              <div key={act.id ?? idx} className={styles.timelineItem}>
                <div className={styles.timelineContent}>
                  <p className={styles.timelineText}>{act.text}</p>
                  <span className={styles.timelineTime}>{formatDateTime(act.created_at)}</span>
                </div>
                <div
                  className={styles.timelineDot}
                  style={{ backgroundColor: ACTIVITY_COLOR[act.kind] || "#94a3b8" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
