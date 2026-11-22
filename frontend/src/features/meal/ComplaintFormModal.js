"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import ProjectField from "@/features/projects/ProjectField";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/Form";
import useOptions from "@/hooks/useOptions";
import { createComplaint } from "@/services/meal.service";
import { COMPLAINT_PRIORITY } from "@/lib/labels";
import { useToast } from "@/components/Toast/ToastProvider";

const PRIORITY_OPTIONS = Object.entries(COMPLAINT_PRIORITY).map(([value, { label }]) => ({ value, label }));
const EMPTY = { type: "", project_id: "", region: "", channel: "", priority: "medium", description: "", reporter_name: "" };

export default function ComplaintFormModal({ open, onClose }) {
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
    mutationFn: createComplaint,
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal"] });
      toast.success("تم تسجيل الشكوى.");
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
    if (!form.type) local.type = "نوع الشكوى مطلوب";
    if (!form.project_id) local.project_id = "المشروع مطلوب";
    if (!form.channel) local.channel = "قناة الاستلام مطلوبة";
    if (Object.keys(local).length) return setErrors(local);
    mutation.mutate({ ...form, project_id: Number(form.project_id) });
  };

  return (
    <Modal open={open} onClose={onClose} title="تسجيل شكوى جديدة">
      <form onSubmit={submit} noValidate>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="نوع الشكوى" required error={errors.type}>
            <Select value={form.type} onChange={set("type")} placeholder="اختر النوع" options={list("complaint_types")} />
          </Field>
          <ProjectField value={form.project_id} onChange={set("project_id")} error={errors.project_id} />
          <Field label="المنطقة" error={errors.region}>
            <Select value={form.region} onChange={set("region")} placeholder="اختر المنطقة" options={list("regions")} />
          </Field>
          <Field label="قناة الاستلام" required error={errors.channel}>
            <Select value={form.channel} onChange={set("channel")} placeholder="اختر القناة" options={list("channels")} />
          </Field>
          <Field label="الأولوية" error={errors.priority}>
            <Select value={form.priority} onChange={set("priority")} options={PRIORITY_OPTIONS} />
          </Field>
          <Field label="اسم مقدّم الشكوى (اختياري)" error={errors.reporter_name}>
            <Input value={form.reporter_name} onChange={set("reporter_name")} />
          </Field>
          <Field label="وصف الشكوى" error={errors.description}>
            <Textarea value={form.description} onChange={set("description")} />
          </Field>
        </div>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel="تسجيل الشكوى" />
      </form>
    </Modal>
  );
}
