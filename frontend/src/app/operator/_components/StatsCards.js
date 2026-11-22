"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, HeartHandshake, Users } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import { getPlatformStats } from "@/services/platform.service";
import { formatDateTime, formatNumber } from "@/lib/format";
import styles from "../operator.module.css";

export const STATS_KEY = ["platform", "stats"];

function Card({ icon: Icon, label, value, sub, tone = "brand" }) {
  return (
    <div className={`${styles.kpi} ${styles[`kpi_${tone}`] || ""}`}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiIcon} aria-hidden="true">
          <Icon size={18} />
        </span>
      </div>
      <div className={styles.kpiValue}>{value}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

/** Platform-wide figures: active organizations, employees across all tenants, beneficiaries reached, system health. */
export default function StatsCards() {
  const query = useQuery({ queryKey: STATS_KEY, queryFn: getPlatformStats, refetchInterval: 60_000 });

  return (
    <section aria-label="الإحصائيات الشاملة">
      <QueryState query={query} rows={1} block>
        {(s) => {
          const by = s.organizations.by_status;
          const healthy = s.health?.status === "ok";
          return (
            <div className={styles.kpiGrid}>
              <Card
                icon={Building2}
                label="المؤسسات النشطة"
                value={formatNumber(by.approved)}
                sub={
                  by.pending_approval > 0
                    ? `${formatNumber(by.pending_approval)} بانتظار الاعتماد · من أصل ${formatNumber(s.organizations.total)}`
                    : `من أصل ${formatNumber(s.organizations.total)} مؤسسة مسجلة`
                }
              />
              <Card
                icon={Users}
                label="الموظفون في كل المؤسسات"
                value={formatNumber(s.employees.total)}
                sub={`${formatNumber(s.employees.active)} حساب نشط`}
                tone="info"
              />
              <Card
                icon={HeartHandshake}
                label="المستفيدون"
                value={formatNumber(s.beneficiaries_reached)}
                sub="من السجلات الميدانية المعتمدة"
                tone="violet"
              />
              <Card
                icon={Activity}
                label="حالة النظام"
                value={healthy ? "تعمل بشكل طبيعي" : "تحتاج متابعة"}
                sub={s.health?.checked_at ? `آخر فحص ${formatDateTime(s.health.checked_at)}` : null}
                tone={healthy ? "success" : "danger"}
              />
            </div>
          );
        }}
      </QueryState>
    </section>
  );
}
