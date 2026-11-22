"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/Form";
import { createProject, updateProject } from "@/services/projects.service";
import { PROJECT_STATUS } from "@/lib/labels";
import { useToast } from "@/components/Toast/ToastProvider";

const STATUS_OPTIONS = Object.entries(PROJECT_STATUS).map(([value, { label }]) => ({ value, label }));

const fromProject = (p) => ({
  name: p?.name ?? "",
  description: p?.description ?? "",
  status: p?.status ?? "active",
  start_date: (p?.start_date ?? "").slice(0, 10),
  end_date: (p?.end_date ?? "").slice(0, 10),
});

/** Create (no `project`) or edit (`project` given). Only people with `projects.manage` reach this. */
export default function ProjectFormModal({ open, onClose, project, onSaved }) {
  const editing = Boolean(project);
  const [form, setForm] = useState(() => fromProject(project));
  const [errors, setErrors] = useState({});
  const toast = useToast();
  const queryClient = useQueryClient();

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: (body) => (editing ? updateProject(project.id, body) : createProject(body)),
    meta: { silent: true },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["options"] });
      toast.success(editing ? "تم تحديث المشروع." : "تم إنشاء المشروع. أضف إليه الفريق الآن.");
      onSaved?.(res?.data ?? res);
      onClose();
    },
    onError: (err) => {
      setErrors(err.fieldErrors || {});
      toast.error(err.message);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setErrors({ name: "اسم المشروع مطلوب" });
    mutation.mutate({ ...form, name: form.name.trim() });
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل المشروع" : "مشروع جديد"}>
      <form onSubmit={submit} noValidate>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="اسم المشروع" required error={errors.name}>
            <Input value={form.name} onChange={set("name")} placeholder="مثال: مشروع المياه والصرف الصحي" />
          </Field>
          <Field label="الوصف" error={errors.description}>
            <Textarea value={form.description} onChange={set("description")} />
          </Field>
          <Field label="الحالة" error={errors.status}>
            <Select value={form.status} onChange={set("status")} options={STATUS_OPTIONS} />
          </Field>
          <Field label="تاريخ البداية" error={errors.start_date}>
            <Input type="date" value={form.start_date} onChange={set("start_date")} />
          </Field>
          <Field label="تاريخ النهاية" error={errors.end_date}>
            <Input type="date" value={form.end_date} onChange={set("end_date")} />
          </Field>
        </div>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel={editing ? "حفظ التعديلات" : "إنشاء المشروع"} />
      </form>
    </Modal>
  );
}
