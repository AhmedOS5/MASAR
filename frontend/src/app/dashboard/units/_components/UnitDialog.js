"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { FormActions } from "@/components/ui/Form";
import { updateUnit } from "@/services/workspace.service";
import { UNIT_STATUS, UNIT_TIER } from "@/lib/labels";
import { useToast } from "@/components/Toast/ToastProvider";

/** mode "details": read-only. mode "setup": enable/disable and save. */
export default function UnitDialog({ unit, mode, onClose }) {
  const [enabled, setEnabled] = useState(unit.status === "active");
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEnable = unit.status !== "in_development";

  const save = useMutation({
    mutationFn: () => updateUnit(unit.id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("تم حفظ إعدادات الوحدة.");
      onClose();
    },
  });

  const fields = [
    ["الحالة", UNIT_STATUS[unit.status]?.label ?? unit.status],
    ["النوع", UNIT_TIER[unit.tier] ?? unit.tier],
    ["عدد الصلاحيات", unit.roles_count ?? 0],
    ["عدد الشاشات", unit.screens_count ?? 0],
    ["المسؤولون", unit.manager_roles || "—"],
  ];

  return (
    <Modal open onClose={onClose} title={unit.title}>
      <p style={{ margin: "0 0 14px", lineHeight: 1.7, color: "#475569" }}>{unit.description}</p>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", margin: 0 }}>
        {fields.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt style={{ color: "#64748b" }}>{k}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{v}</dd>
          </React.Fragment>
        ))}
      </dl>

      {mode === "setup" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16 }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEnable}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            تفعيل هذه الوحدة{!canEnable && " (قيد التطوير)"}
          </label>
          <FormActions onCancel={onClose} submitting={save.isPending} submitLabel="حفظ الإعدادات" />
        </form>
      ) : null}
    </Modal>
  );
}
