"use client";

import React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Eye, Users } from "lucide-react";
import { updateUnit } from "@/services/workspace.service";
import { UnitIcon } from "@/lib/icons";
import { UNIT_STATUS, UNIT_TIER } from "@/lib/labels";
import { useToast } from "@/components/Toast/ToastProvider";
import usePermissions from "@/hooks/usePermissions";
import ui from "@/components/ui/ui.module.css";
import styles from "./UnitCard.module.css";

export default function UnitCard({ unit, onOpen }) {
  const { id, title, description, status, tier, roles_count, screens_count, manager_roles, icon, href } = unit;
  const st = UNIT_STATUS[status] ?? { label: status, color: "#94a3b8" };
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = usePermissions();

  const toggle = useMutation({
    mutationFn: (enabled) => updateUnit(id, { enabled }),
    onSuccess: (_d, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(enabled ? "تم تفعيل الوحدة." : "تم تعطيل الوحدة.");
    },
  });

  const toggleable = status !== "in_development";

  return (
    <div className={styles.cardContainer}>
      <div className={styles.cardHeader}>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${styles.badgeType}`}>{UNIT_TIER[tier] ?? tier}</span>
          <span className={`${ui.badge} ${ui[`badge_${st.tone ?? "neutral"}`]}`}>
            {st.label}
          </span>
        </div>
        <div className={styles.iconBox}>
          <UnitIcon name={icon} size={20} className={styles.unitIcon} />
        </div>
      </div>

      <div className={styles.cardBody}>
        <h4 className={styles.unitTitle}>{title}</h4>
        <p className={styles.unitDesc}>{description}</p>
      </div>

      <div className={styles.metaRow}>
        <label className={styles.switch} title={toggleable ? undefined : "الوحدة قيد التطوير"}>
          <input
            type="checkbox"
            aria-label={`تفعيل ${title}`}
            checked={status === "active"}
            disabled={!toggleable || !can("units.manage") || toggle.isPending}
            onChange={(e) => toggle.mutate(e.target.checked)}
          />
          <span className={styles.slider}></span>
        </label>
        <div className={styles.numbers}>
          <span className={styles.numItem}>
            <b>{roles_count ?? 0}</b> صلاحية
          </span>
          <span className={styles.numItem}>
            <b>{screens_count ?? 0}</b> شاشة
          </span>
        </div>
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.managerInfo}>
          <Users size={14} />
          <span>{manager_roles || "—"}</span>
        </div>
        <div className={styles.actions}>
          {href && status === "active" ? (
            <Link href={href} className={styles.btnSecondary}>
              <Eye size={14} />
              <span>عرض التفاصيل</span>
            </Link>
          ) : (
            <button type="button" className={styles.btnSecondary} onClick={() => onOpen("details")}>
              <Eye size={14} />
              <span>عرض التفاصيل</span>
            </button>
          )}
          {can("units.manage") && (
            <button type="button" className={styles.btnPrimary} onClick={() => onOpen("setup")}>
              <Settings size={14} />
              <span>إعداد الوحدة</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
