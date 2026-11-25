"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Plus, Edit3, Settings } from "lucide-react";
import QueryState from "@/components/ui/QueryState";
import PageHeader from "@/components/ui/PageHeader";
import ui from "@/components/ui/ui.module.css";
import RoleFormModal from "@/features/people/RoleFormModal";
import { listPermissions, listRoles } from "@/services/people.service";
import usePermissions from "@/hooks/usePermissions";
import styles from "./roles.module.css";
import dashboardStyles from "../dashboard.module.css";

export default function RolesPage() {
  const { can } = usePermissions();
  const [formState, setFormState] = useState(null); // null | { role? }
  const query = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  // The API may return permission keys only; resolve their display labels from /permissions.
  const permissions = useQuery({ queryKey: ["permissions"], queryFn: listPermissions });
  const labelOf = Object.fromEntries((permissions.data ?? []).map((p) => [p.key, p.label]));

  return (
    <main className={dashboardStyles.mainContainer}>
      <PageHeader
        icon={ShieldCheck}
        title="الأدوار والصلاحيات"
        subtitle="إدارة مستويات الوصول وصلاحيات النظام للمستخدمين"
        primary={
          can("roles.manage") && (
            <button type="button" className={ui.primaryBtn} onClick={() => setFormState({})}>
              <Plus size={16} aria-hidden="true" /> إنشاء دور جديد
            </button>
          )
        }
      />

      <QueryState query={query} isEmpty={(d) => d.length === 0} emptyIcon={ShieldCheck} emptyText="لا توجد أدوار معرّفة بعد.">
        {(roles) => (
          <div className={styles.rolesGrid}>
            {roles.map((role) => (
              <div key={role.id} className={styles.roleCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.roleInfo}>
                    <h3 className={styles.roleTitle}>
                      {role.title}
                      {role.is_system_admin && <Settings size={16} className={styles.adminIcon} aria-hidden="true" />}
                    </h3>
                    <span className={styles.usersCount}>مخصص لـ {role.users_count ?? 0} مستخدم</span>
                  </div>
                  {can("roles.manage") && (
                    <button
                      type="button"
                      aria-label={`تعديل ${role.title}`}
                      className={styles.editBtn}
                      onClick={() => setFormState({ role })}
                    >
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className={styles.permissionsSection}>
                  <div className={styles.permissionsTitle}>الصلاحيات الممنوحة:</div>
                  <div className={styles.permissionsTags}>
                    {(role.permissions ?? []).length === 0 && <span className={styles.permTag}>—</span>}
                    {(role.permissions ?? []).map((perm) => {
                      const label = typeof perm === "object" ? (perm.label ?? labelOf[perm.key] ?? perm.key) : (labelOf[perm] ?? perm);
                      return (
                        <span
                          key={typeof perm === "object" ? (perm.key ?? perm.id) : perm}
                          className={`${styles.permTag} ${role.is_system_admin ? styles.sysAdminTag : ""}`}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryState>

      {formState && <RoleFormModal open role={formState.role} onClose={() => setFormState(null)} />}
    </main>
  );
}
