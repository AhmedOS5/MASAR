"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Plus, Search } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";
import ProjectFormModal from "@/features/projects/ProjectFormModal";
import usePermissions from "@/hooks/usePermissions";
import useDebounce from "@/hooks/useDebounce";
import { listProjects } from "@/services/projects.service";
import { PROJECT_ROLE, PROJECT_STATUS } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import dashboardStyles from "../dashboard.module.css";
import styles from "./projects.module.css";

function ProjectsContent() {
  const { can } = usePermissions();
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);

  const params = { status, search: debounced, per_page: 50 };
  const query = useQuery({ queryKey: ["projects", params], queryFn: () => listProjects(params) });

  return (
    <main className={`${dashboardStyles.mainContainer} ${styles.page}`}>
      <PageHeader
        icon={Briefcase}
        title="المشاريع"
        subtitle="لكل مشروع مساحة عمل خاصة: فريقه وطلباته ومهامه ومستفيدوه وملفاته وتقاريره."
        primary={
          can("projects.manage") && (
            <button type="button" className={ui.primaryBtn} onClick={() => setCreateOpen(true)}>
              <Plus size={16} aria-hidden="true" /> مشروع جديد
            </button>
          )
        }
        toolbar={
          <>
            <label className={ui.searchBox}>
              <Search size={16} aria-hidden="true" />
              <input
                className={ui.input}
                type="search"
                aria-label="بحث في المشاريع"
                placeholder="ابحث باسم المشروع أو رمزه"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select className={ui.control} aria-label="حالة المشروع" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">كل الحالات</option>
              {Object.entries(PROJECT_STATUS).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </>
        }
      />

      <QueryState
        query={query}
        isEmpty={(d) => d.items.length === 0}
        emptyIcon={Briefcase}
        emptyText={can("projects.manage") ? "لا توجد مشاريع بعد. أنشئ مشروعاً وعيّن له الفريق." : "لم تُضف إلى أي مشروع بعد. سيضيفك مدير النظام إلى مشروع."}
      >
        {({ items }) => (
          <div className={styles.grid}>
            {items.map((p) => {
              const st = PROJECT_STATUS[p.status] ?? { label: p.status, tone: "neutral" };
              return (
                <Link key={p.id} href={`/dashboard/projects/${p.id}`} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.code}>{p.code}</span>
                    <span className={`${ui.badge} ${ui[`badge_${st.tone}`]}`}>{st.label}</span>
                  </div>
                  <h2 className={styles.cardTitle}>{p.name}</h2>
                  {p.description && <p className={styles.cardDesc}>{p.description}</p>}
                  <div className={styles.stats}>
                    <span><b>{formatNumber(p.members_count)}</b> في الفريق</span>
                    <span><b>{formatNumber(p.requests_count)}</b> طلب</span>
                    <span><b>{formatNumber(p.tasks_count)}</b> مهمة</span>
                    {p.beneficiaries_count > 0 && <span><b>{formatNumber(p.beneficiaries_count)}</b> مستفيد</span>}
                  </div>
                  {p.my_role && <span className={styles.role}>دورك: {PROJECT_ROLE[p.my_role] ?? p.my_role}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </QueryState>

      {createOpen && <ProjectFormModal open onClose={() => setCreateOpen(false)} />}
    </main>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsContent />
    </Suspense>
  );
}
