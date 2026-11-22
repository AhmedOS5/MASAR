"use client";

import { useQuery } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import QueryState from "@/components/ui/QueryState";
import ui from "@/components/ui/ui.module.css";
import { listEmployeeAudit, listJobCategories, listRoles } from "@/services/people.service";
import { formatDateTime } from "@/lib/format";

const ACTIONS = {
  "employee.role_auto_assigned": "عُيّن الدور تلقائياً",
  "employee.role_changed": "غُيّر الدور يدوياً",
};

/** Who gave this employee which role, and when: automatic (from the job category) or changed by hand. */
export default function EmployeeHistoryModal({ open, onClose, employee }) {
  const audit = useQuery({ queryKey: ["employee-audit", employee.id], queryFn: () => listEmployeeAudit(employee.id) });
  const roles = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  const categories = useQuery({ queryKey: ["job-categories"], queryFn: listJobCategories, staleTime: 10 * 60_000 });

  const roleName = (id) => (id == null ? "بلا دور" : ((roles.data ?? []).find((r) => r.id === id)?.title ?? "دور محذوف"));
  const categoryName = (key) => (categories.data ?? []).find((c) => c.key === key)?.label ?? key;

  return (
    <Modal open={open} onClose={onClose} title={`سجل الدور — ${employee.name}`}>
      <QueryState query={audit} isEmpty={(d) => d.length === 0} emptyText="لم يُسجَّل أي تغيير على دور هذا الموظف.">
        {(items) => (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {items.map((e) => (
              <li key={e.id} style={{ padding: "10px 12px", border: "1px solid var(--ds-line)", borderRadius: 8, display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>{ACTIONS[e.action] ?? e.action}</strong>
                  <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{formatDateTime(e.created_at)}</span>
                </div>
                <div>
                  {roleName(e.meta?.from)} ← {roleName(e.meta?.to)}
                </div>
                <div style={{ fontSize: 12, color: "var(--ds-muted)" }}>
                  {e.actor?.name ? `بواسطة ${e.actor.name}` : "بواسطة مستخدم محذوف"}
                  {e.meta?.category ? ` · الفئة: ${categoryName(e.meta.category)}` : ""}
                  {e.meta?.previous_source === "auto" ? " · كان الدور تلقائياً" : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className={ui.actions}>
        <button type="button" className={ui.secondaryBtn} onClick={onClose}>
          إغلاق
        </button>
      </div>
    </Modal>
  );
}
