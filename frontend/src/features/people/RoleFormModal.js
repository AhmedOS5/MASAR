"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { Field, FormActions, Input, formStyles } from "@/components/ui/Form";
import QueryState from "@/components/ui/QueryState";
import { createRole, listPermissions, updateRole } from "@/services/people.service";
import { useToast } from "@/components/Toast/ToastProvider";

const permKey = (p) => (typeof p === "object" ? (p.key ?? p.id) : p);
const permLabel = (p) => (typeof p === "object" ? (p.label ?? p.key) : p);

export default function RoleFormModal({ open, onClose, role }) {
  const editing = Boolean(role);
  const [title, setTitle] = useState(role?.title ?? "");
  const [selected, setSelected] = useState(() => new Set((role?.permissions ?? []).map(permKey)));
  const [errors, setErrors] = useState({});
  const permissions = useQuery({ queryKey: ["permissions"], queryFn: listPermissions });
  const toast = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (body) => (editing ? updateRole(role.id, body) : createRole(body)),
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success(editing ? "تم تحديث الدور." : "تم إنشاء الدور.");
      onClose();
    },
    onError: (err) => {
      setErrors(err.fieldErrors || {});
      toast.error(err.message);
    },
  });

  const toggle = (key) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return setErrors({ title: "اسم الدور مطلوب" });
    mutation.mutate({ title: title.trim(), permissions: [...selected] });
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل الدور" : "إنشاء دور جديد"}>
      <form onSubmit={submit} noValidate>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="اسم الدور" required error={errors.title}>
            <Input value={title} onChange={(e) => { setTitle(e.target.value); setErrors({}); }} />
          </Field>
          <div>
            <div className={formStyles.label} style={{ marginBottom: 8 }}>الصلاحيات</div>
            <QueryState query={permissions} isEmpty={(d) => d.length === 0} emptyText="لا توجد صلاحيات معرّفة.">
              {(items) => (
                <div className={formStyles.checkList}>
                  {items.map((p) => (
                    <label key={permKey(p)} className={formStyles.checkItem}>
                      <input
                        type="checkbox"
                        checked={selected.has(permKey(p))}
                        onChange={() => toggle(permKey(p))}
                      />
                      {permLabel(p)}
                    </label>
                  ))}
                </div>
              )}
            </QueryState>
            {errors.permissions && <span className={formStyles.fieldError}>{errors.permissions}</span>}
          </div>
        </div>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel={editing ? "حفظ" : "إنشاء"} />
      </form>
    </Modal>
  );
}
