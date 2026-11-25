"use client";

import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, TrendingUp, PieChart, FileText, Download, Filter, UploadCloud } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import useOptions from "@/hooks/useOptions";
import usePermissions from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast/ToastProvider";
import { useWorkProjects } from "@/features/projects/ProjectField";
import { uploadReport } from "@/services/projects.service";
import { getReportsSummary, listReports, reportDownloadUrl } from "@/services/workspace.service";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";
import styles from "./reports.module.css";
import dashboardStyles from "../dashboard.module.css";

const STATS = [
  { key: "total_reports", label: "إجمالي التقارير المصدرة", icon: FileText, tone: "info" },
  { key: "monthly_progress", label: "معدل الإنجاز الشهري", icon: TrendingUp, tone: "success", signed: true, suffix: "%" },
  { key: "active_sections", label: "أقسام نشطة بالتحليل", icon: PieChart, tone: "neutral" },
];

function formatStat(def, value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (def.signed && Number.isFinite(n)) return `${n > 0 ? "+" : ""}${formatNumber(n)}${def.suffix ?? ""}`;
  return formatNumber(value);
}

export default function ReportsPage() {
  const [showFilter, setShowFilter] = useState(false);
  const [type, setType] = useState("all");
  const { list } = useOptions();
  const { can } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);

  // A report always belongs to a project (it can also be filed in a folder from the project's own page).
  const projects = useWorkProjects();
  const [projectId, setProjectId] = useState("");
  const addReport = useMutation({
    mutationFn: (file) => uploadReport(file, { projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("تم رفع التقرير.");
    },
  });

  const summary = useQuery({ queryKey: ["reports", "summary"], queryFn: getReportsSummary });
  const reports = useQuery({
    queryKey: ["reports", "list", type],
    queryFn: () => listReports({ type, per_page: 20 }),
  });

  return (
    <main className={dashboardStyles.mainContainer}>
      <PageHeader
        icon={BarChart3}
        title="التقارير والإحصائيات"
        subtitle="استعراض وتحليل أداء المؤسسة الشامل"
        secondary={
          <button type="button" className={ui.secondaryBtn} aria-expanded={showFilter} onClick={() => setShowFilter((s) => !s)}>
            <Filter size={16} aria-hidden="true" /> تصفية التقارير
          </button>
        }
        primary={
          can("reports.manage") && (
            <div className={ui.inlineForm}>
              <select
                aria-label="مشروع التقرير"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={ui.control}
              >
                <option value="">اختر المشروع</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                type="button"
                className={ui.primaryBtn}
                disabled={addReport.isPending || !projectId}
                title={projectId ? undefined : "اختر المشروع أولاً: كل تقرير يتبع مشروعاً"}
                onClick={() => fileRef.current?.click()}
              >
                <UploadCloud size={16} aria-hidden="true" />
                {addReport.isPending ? "جاري الرفع..." : "رفع تقرير"}
              </button>
              <input
                ref={fileRef}
                type="file"
                hidden
                aria-label="ملف التقرير"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addReport.mutate(f);
                  e.target.value = "";
                }}
              />
            </div>
          )
        }
        toolbar={
          showFilter && (
            <select aria-label="نوع التقرير" value={type} onChange={(e) => setType(e.target.value)} className={ui.control}>
              <option value="all">كل الأنواع</option>
              {list("report_types").map((o) => {
                const opt = typeof o === "object" ? o : { value: o, label: o };
                return <option key={opt.value} value={opt.value}>{opt.label}</option>;
              })}
            </select>
          )
        }
      />

      <QueryState query={summary} rows={2} block>
        {(data) => (
          <div className={styles.statsGrid}>
            {STATS.map((def) => {
              const Icon = def.icon;
              return (
                <div key={def.key} className={styles.statCard}>
                  <div className={`${styles.statIcon} ${styles[`tone_${def.tone}`]}`}>
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <div className={styles.statInfo}>
                    <p className={styles.statValue}><bdi>{formatStat(def, data?.[def.key])}</bdi></p>
                    <p className={styles.statLabel}>{def.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </QueryState>

      <div className={styles.reportsList}>
        <h2 className={styles.listTitle}>أحدث التقارير الجاهزة</h2>
        <QueryState query={reports} isEmpty={(d) => d.items.length === 0} emptyText="لا توجد تقارير جاهزة.">
          {({ items }) =>
            items.map((report) => (
              <div key={report.id} className={styles.reportItem}>
                <div className={styles.reportInfo}>
                  <div className={styles.reportIcon}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <h4 className={styles.reportName}>{report.name}</h4>
                    <p className={styles.reportDate}>
                      {[report.type, report.period].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                </div>
                <a className={`${ui.secondaryBtn} ${styles.downloadBtn}`} href={reportDownloadUrl(report.id)} download>
                  <Download size={16} aria-hidden="true" />
                  تحميل PDF
                </a>
              </div>
            ))
          }
        </QueryState>
      </div>
    </main>
  );
}
