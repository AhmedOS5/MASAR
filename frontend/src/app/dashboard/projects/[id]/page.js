"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Pencil, Users } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import ui from "@/components/ui/ui.module.css";
import PageHeader from "@/components/ui/PageHeader";
import ProjectFormModal from "@/features/projects/ProjectFormModal";
import TeamModal from "@/features/projects/TeamModal";
import ProjectWork from "@/features/projects/ProjectWork";
import ProjectBeneficiaries from "@/features/projects/ProjectBeneficiaries";
import ProjectFiles from "@/features/projects/ProjectFiles";
import usePermissions from "@/hooks/usePermissions";
import { getProject } from "@/services/projects.service";
import { PROJECT_ROLE, PROJECT_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import dashboardStyles from "../../dashboard.module.css";
import styles from "../projects.module.css";

export default function ProjectPage() {
  const { id } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = useState("team");
  const [modal, setModal] = useState(null); // "edit" | "team"

  const query = useQuery({ queryKey: ["project", String(id)], queryFn: () => getProject(id) });

  const tabs = [
    { key: "team", label: "الفريق", show: true },
    { key: "work", label: "الطلبات والمهام", show: can("requests.view") || can("tasks.view") },
    { key: "beneficiaries", label: "المستفيدون", show: can("beneficiaries.view") },
    { key: "files", label: "الملفات والتقارير", show: can("files.view") || can("reports.view") },
  ].filter((t) => t.show);

  return (
    <main className={`${dashboardStyles.mainContainer} ${styles.page}`}>
      <Link href="/dashboard/projects" className={`${ui.ghostBtn} ${styles.backLink}`}>
        <ArrowRight size={14} aria-hidden="true" /> كل المشاريع
      </Link>

      <QueryState query={query} isEmpty={() => false} rows={4} block>
        {(project) => {
          const st = PROJECT_STATUS[project.status] ?? { label: project.status, tone: "neutral" };
          return (
            <>
              <PageHeader
                title={project.name}
                subtitle={project.description}
                badge={<span className={`${ui.badge} ${ui[`badge_${st.tone}`]}`}>{st.label}</span>}
                meta={
                  <>
                    <span className={styles.code}>{project.code}</span>
                    {project.start_date && <span>من {formatDate(project.start_date)}</span>}
                    {project.end_date && <span>إلى {formatDate(project.end_date)}</span>}
                    {project.my_role && <span>دورك: {PROJECT_ROLE[project.my_role] ?? project.my_role}</span>}
                  </>
                }
                secondary={
                  can("projects.manage") && (
                    <button type="button" className={ui.secondaryBtn} onClick={() => setModal("edit")}>
                      <Pencil size={14} aria-hidden="true" /> تعديل المشروع
                    </button>
                  )
                }
                primary={
                  can("projects.manage") && (
                    <button type="button" className={ui.primaryBtn} onClick={() => setModal("team")}>
                      <Users size={14} aria-hidden="true" /> تعديل الفريق
                    </button>
                  )
                }
              />

              <div className={styles.tabs} role="tablist" aria-label="أقسام المشروع">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "team" && (
                <section className={styles.panel} aria-label="فريق المشروع">
                  {project.members.length === 0 ? (
                    <p className={styles.note}>لم يُعيَّن فريق لهذا المشروع بعد.{can("projects.manage") ? " اضغط «تعديل الفريق» لإضافة الموظفين والمشرفين." : ""}</p>
                  ) : (
                    <ul className={styles.list}>
                      {project.members.map((m) => (
                        <li key={m.user_id} className={styles.row}>
                          <div className={styles.rowMain}>
                            <span className={styles.rowTitle}>{m.name}</span>
                            <span className={styles.rowSub}>{m.role_title ?? m.email}</span>
                          </div>
                          <span className={`${ui.badge} ${m.project_role === "supervisor" ? ui.badge_info : ui.badge_neutral}`}>
                            {PROJECT_ROLE[m.project_role] ?? m.project_role}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {tab === "work" && <ProjectWork project={project} />}
              {tab === "beneficiaries" && <ProjectBeneficiaries project={project} />}
              {tab === "files" && <ProjectFiles project={project} />}

              {modal === "edit" && <ProjectFormModal open project={project} onClose={() => setModal(null)} />}
              {modal === "team" && <TeamModal open project={project} onClose={() => setModal(null)} />}
            </>
          );
        }}
      </QueryState>
    </main>
  );
}
