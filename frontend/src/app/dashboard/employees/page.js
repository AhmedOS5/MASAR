"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Edit2, Trash2, Mail, Send, Search, History } from "lucide-react";
import EmployeeHistoryModal from "@/features/people/EmployeeHistoryModal";
import QueryState, { EmptyState } from "@/components/ui/QueryState";
import ui from "@/components/ui/ui.module.css";
import { formatNumber } from "@/lib/format";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmployeeFormModal from "@/features/people/EmployeeFormModal";
import { deleteEmployee, listEmployees, resendInvite } from "@/services/people.service";
import { useToast } from "@/components/Toast/ToastProvider";
import usePermissions from "@/hooks/usePermissions";
import styles from "./employees.module.css";

// Figures and filters come from the list the API already returned (it is unpaginated), so they always agree with the cards.
const FILTERS = [
  { key: "all", label: "إجمالي الموظفين", match: () => true },
  { key: "active", label: "نشطون", match: (e) => e.status === "active" },
  { key: "inactive", label: "غير نشطين", match: (e) => e.status !== "active" },
  { key: "pending", label: "دعوات معلّقة", match: (e) => Boolean(e.invite_pending) },
];
const SEARCHED = (e) => [e.name, e.email, e.department, e.role?.title];

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = usePermissions();
  const manage = can("employees.manage");
  const [formState, setFormState] = useState(null); // null | { employee? }
  const [toDelete, setToDelete] = useState(null);
  const [historyOf, setHistoryOf] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const query = useQuery({ queryKey: ["employees"], queryFn: () => listEmployees() });

  const remove = useMutation({
    mutationFn: (id) => deleteEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["options"] });
      toast.success("تم حذف الموظف.");
      setToDelete(null);
    },
  });

  // The invitation code is e-mailed; the server answers with a message only (never the code).
  const invite = useMutation({
    mutationFn: (id) => resendInvite(id),
    onSuccess: (data) => toast.success(data?.message || "تم إرسال دعوة جديدة إلى بريد الموظف."),
  });

  return (
    <div className={styles.pageContainer}>
      <div className={styles.headerWrapper}>
        <div className={styles.titleGroup}>
          <div className={styles.headerIcon}>
            <Users size={24} />
          </div>
          <div>
            <h1 className={styles.pageTitle}>إدارة الموظفين</h1>
            <p className={styles.pageSubtitle}>عرض وإدارة بيانات الموظفين في مساحة العمل</p>
          </div>
        </div>
        {can("employees.manage") && (
          <button type="button" className={styles.actionBtn} onClick={() => setFormState({})}>
            <Plus size={18} />
            إضافة موظف جديد
          </button>
        )}
      </div>

      <QueryState query={query} isEmpty={(d) => d.length === 0} emptyIcon={Users} emptyText="لا يوجد موظفون بعد. ابدأ بإضافة موظف جديد.">
        {(all) => {
          const term = search.trim().toLowerCase();
          const active = FILTERS.find((f) => f.key === filter);
          const employees = all.filter(
            (e) => active.match(e) && (!term || SEARCHED(e).some((v) => String(v ?? "").toLowerCase().includes(term))),
          );
          return (
          <>
          <div className={styles.statsRow} role="group" aria-label="تصفية الموظفين حسب الحالة">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`${styles.statTile} ${filter === f.key ? styles.statTileActive : ""}`}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                <span className={styles.statLabel}>{f.label}</span>
                <span className={styles.statValue}>{formatNumber(all.filter(f.match).length)}</span>
              </button>
            ))}
          </div>
          <div className={styles.toolbar}>
            <label className={ui.searchBox}>
              <Search size={16} aria-hidden="true" />
              <input
                className={ui.input}
                type="search"
                placeholder="ابحث بالاسم أو البريد أو القسم"
                aria-label="بحث في الموظفين"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {employees.length === 0 ? (
            <EmptyState
              icon={Users}
              action={
                <button
                  type="button"
                  className={ui.secondaryBtn}
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  مسح عوامل التصفية
                </button>
              }
            >
              لا يوجد موظفون مطابقون لعوامل التصفية الحالية.
            </EmptyState>
          ) : (
          <div className={styles.gridContainer}>
            {employees.map((emp) => (
              <div key={emp.id} className={styles.employeeCard}>
                <div className={styles.avatarWrapper}>
                  <Users size={32} />
                  <div
                    className={`${styles.statusIndicator} ${emp.status === "active" ? styles.statusActive : styles.statusInactive}`}
                    title={emp.status === "active" ? "نشط" : "غير نشط"}
                  />
                </div>
                <h3 className={styles.empName}>{emp.name}</h3>
                <p className={styles.empRole}>
                  {emp.role?.title ?? emp.role ?? "—"}
                  {emp.role_source && (
                    <span
                      className={styles.empDepartment}
                      title={emp.role_source === "auto" ? "عُيّن الدور تلقائياً حسب المسمى الوظيفي" : "غُيّر الدور يدوياً من مدير النظام"}
                    >
                      {" · "}
                      {emp.role_source === "auto" ? "تلقائي" : "معدّل يدوياً"}
                    </span>
                  )}
                </p>
                <p className={styles.empDepartment}>{emp.department ?? "—"}</p>
                {emp.invite_pending && (
                  <span className={styles.pendingBadge} title="لم يختر الموظف كلمة المرور بعد">
                    بانتظار التفعيل
                  </span>
                )}

                <div className={styles.cardActions}>
                  {manage && emp.invite_pending && emp.status === "active" && (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="إعادة إرسال الدعوة"
                      aria-label={`إعادة إرسال الدعوة إلى ${emp.name}`}
                      disabled={invite.isPending && invite.variables === emp.id}
                      onClick={() => invite.mutate(emp.id)}
                    >
                      <Send size={16} />
                    </button>
                  )}
                  <button type="button" className={styles.iconBtn} title="سجل الدور" aria-label={`سجل دور ${emp.name}`} onClick={() => setHistoryOf(emp)}>
                    <History size={16} />
                  </button>
                  {emp.email && (
                    <a className={styles.iconBtn} title="مراسلة" aria-label={`مراسلة ${emp.name}`} href={`mailto:${emp.email}`}>
                      <Mail size={16} />
                    </a>
                  )}
                  {manage && (
                    <button type="button" className={styles.iconBtn} title="تعديل" aria-label={`تعديل ${emp.name}`} onClick={() => setFormState({ employee: emp })}>
                      <Edit2 size={16} />
                    </button>
                  )}
                  {manage && (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="حذف"
                      aria-label={`حذف ${emp.name}`}
                      style={{ color: "var(--ds-danger-fg)" }}
                      onClick={() => setToDelete(emp)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
          </>
          );
        }}
      </QueryState>

      {historyOf && <EmployeeHistoryModal open employee={historyOf} onClose={() => setHistoryOf(null)} />}
      {formState && (
        <EmployeeFormModal open employee={formState.employee} onClose={() => setFormState(null)} />
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="حذف موظف"
        message={`هل أنت متأكد من حذف "${toDelete?.name ?? ""}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        busy={remove.isPending}
        onConfirm={() => remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
