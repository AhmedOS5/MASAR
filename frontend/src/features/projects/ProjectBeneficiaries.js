"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import ui from "@/components/ui/ui.module.css";
import BeneficiaryFormModal from "@/features/projects/BeneficiaryFormModal";
import usePermissions from "@/hooks/usePermissions";
import useDebounce from "@/hooks/useDebounce";
import { listBeneficiaries } from "@/services/projects.service";
import { BENEFICIARY_STATUS, GENDER } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import styles from "@/app/dashboard/projects/projects.module.css";

/** The project's beneficiaries registry: search, register, open a beneficiary's file. Personal data — team only. */
export default function ProjectBeneficiaries({ project }) {
  const { can } = usePermissions();
  const canEdit = can("beneficiaries.edit");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [modal, setModal] = useState(null); // {} = new, { beneficiary } = open
  const debounced = useDebounce(search);
  const params = { search: debounced, status, per_page: 50 };
  const query = useQuery({
    queryKey: ["beneficiaries", project.id, params],
    queryFn: () => listBeneficiaries(project.id, params),
    placeholderData: keepPreviousData,
  });

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          المستفيدون {query.data?.meta?.total != null && <span className={styles.rowSub}>({formatNumber(query.data.meta.total)})</span>}
        </h2>
        {canEdit && (
          <button type="button" className={ui.primaryBtn} onClick={() => setModal({})}>
            <Plus size={14} aria-hidden="true" /> تسجيل مستفيد
          </button>
        )}
      </div>

      <div className={ui.toolbar}>
        <input
          className={ui.input}
          type="search"
          aria-label="بحث في المستفيدين"
          placeholder="الاسم أو رقم الهوية أو الجوال أو الرمز"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={ui.select} aria-label="حالة المستفيد" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">كل الحالات</option>
          {Object.entries(BENEFICIARY_STATUS).map(([k, { label }]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>

      <QueryState
        query={query}
        isEmpty={(d) => d.items.length === 0}
        emptyIcon={Users}
        emptyText={canEdit ? "لا يوجد مستفيدون مسجلون في هذا المشروع بعد." : "لا يوجد مستفيدون مسجلون."}
      >
        {({ items }) => (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>الاسم</th>
                  <th>رقم الهوية</th>
                  <th>الجنس</th>
                  <th>الجوال</th>
                  <th>المنطقة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => {
                  const st = BENEFICIARY_STATUS[b.status] ?? { label: b.status, tone: "neutral" };
                  return (
                    <tr key={b.id}>
                      <td className={ui.num}>{b.code}</td>
                      <td>
                        <button type="button" className={ui.ghostBtn} onClick={() => setModal({ beneficiary: b })} aria-label={`فتح ملف ${b.full_name}`}>
                          {b.full_name}
                        </button>
                      </td>
                      <td className={ui.num}>{b.national_id ?? "—"}</td>
                      <td>{GENDER[b.gender] ?? "—"}</td>
                      <td className={ui.num}>{b.phone ?? "—"}</td>
                      <td>{b.region ?? "—"}</td>
                      <td><span className={`${ui.badge} ${ui[`badge_${st.tone}`]}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>

      {modal && (
        <BeneficiaryFormModal
          open
          onClose={() => setModal(null)}
          projectId={project.id}
          beneficiary={modal.beneficiary}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
