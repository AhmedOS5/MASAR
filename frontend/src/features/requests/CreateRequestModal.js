"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/Form";
import useOptions from "@/hooks/useOptions";
import ProjectField from "@/features/projects/ProjectField";
import { createRequest } from "@/services/requests.service";
import { PRIORITY } from "@/lib/labels";
import { useToast } from "@/components/Toast/ToastProvider";

const EMPTY = { project_id: "", title: "", type: "", department: "", priority: "medium", amount: "", description: "" };
const PRIORITY_OPTIONS = Object.entries(PRIORITY).map(([value, { label }]) => ({ value, label }));

/** A request always belongs to a project: `projectId` when opened from a project's page, otherwise the form asks for it. */
export default function CreateRequestModal({ open, onClose, projectId }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const { list } = useOptions();
  const toast = useToast();
  const queryClient = useQueryClient();

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: createRequest,
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("تم إنشاء الطلب بنجاح.");
      setForm(EMPTY);
      onClose();
    },
    onError: (err) => {
      setErrors(err.fieldErrors || {});
      toast.error(err.message);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const local = {};
    const project = projectId ?? form.project_id;
    if (!project) local.project_id = "المشروع مطلوب";
    if (!form.title.trim()) local.title = "عنوان الطلب مطلوب";
    if (!form.type) local.type = "نوع الطلب مطلوب";
    if (Object.keys(local).length) return setErrors(local);
    mutation.mutate({
      ...form,
      project_id: Number(project),
      amount: form.amount === "" ? null : Number(form.amount),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="إنشاء طلب جديد">
      <form onSubmit={submit} noValidate>
        <div className="formGridWrap" style={{ display: "grid", gap: 14 }}>
          {!projectId && <ProjectField value={form.project_id} onChange={set("project_id")} error={errors.project_id} />}
          <Field label="عنوان الطلب" required error={errors.title}>
            <Input value={form.title} onChange={set("title")} placeholder="مثال: شراء معدات مكتبية" />
          </Field>
          <Field label="نوع الطلب" required error={errors.type}>
            <Select value={form.type} onChange={set("type")} placeholder="اختر النوع" options={list("request_types")} />
          </Field>
          <Field label="القسم" error={errors.department}>
            <Select value={form.department} onChange={set("department")} placeholder="اختر القسم" options={list("departments")} />
          </Field>
          <Field label="الأولوية" error={errors.priority}>
            <Select value={form.priority} onChange={set("priority")} options={PRIORITY_OPTIONS} />
          </Field>
          <Field label="المبلغ التقديري (USD)" error={errors.amount}>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} />
          </Field>
          <Field label="الوصف" error={errors.description}>
            <Textarea value={form.description} onChange={set("description")} />
          </Field>
        </div>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel="إنشاء الطلب" />
      </form>
    </Modal>
  );
}
