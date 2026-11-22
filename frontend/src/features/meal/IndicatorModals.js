"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import ProjectField from "@/features/projects/ProjectField";
import { Field, FormActions, Input, Select } from "@/components/ui/Form";
import useOptions from "@/hooks/useOptions";
import { createIndicator, updateIndicator } from "@/services/meal.service";
import { useToast } from "@/components/Toast/ToastProvider";

function useIndicatorMutation(fn, successMessage, onClose, setErrors) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal"] });
      toast.success(successMessage);
      onClose();
    },
    onError: (err) => {
      setErrors(err.fieldErrors || {});
      toast.error(err.message);
    },
  });
}

const EMPTY = { code: "", name: "", project_id: "", sector: "", target: "", owner_id: "" };

export function IndicatorFormModal({ open, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const { list } = useOptions();
  const mutation = useIndicatorMutation(createIndicator, "تمت إضافة المؤشر.", onClose, setErrors);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const submit = (e) => {
    e.preventDefault();
    const local = {};
    if (!form.code.trim()) local.code = "رمز المؤشر مطلوب";
    if (!form.name.trim()) local.name = "اسم المؤشر مطلوب";
    if (!form.project_id) local.project_id = "المشروع مطلوب";
    if (form.target === "" || Number(form.target) <= 0) local.target = "أدخل قيمة مستهدفة صحيحة";
    if (Object.keys(local).length) return setErrors(local);
    mutation.mutate({ ...form, project_id: Number(form.project_id), target: Number(form.target), owner_id: form.owner_id || null });
  };

  return (
    <Modal open={open} onClose={onClose} title="إضافة مؤشر">
      <form onSubmit={submit} noValidate>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="رمز المؤشر" required error={errors.code}>
            <Input value={form.code} onChange={set("code")} placeholder="مثال: WASH-1.1" />
          </Field>
          <Field label="اسم المؤشر" required error={errors.name}>
            <Input value={form.name} onChange={set("name")} />
          </Field>
          <ProjectField value={form.project_id} onChange={set("project_id")} error={errors.project_id} />
          <Field label="القطاع" error={errors.sector}>
            <Select value={form.sector} onChange={set("sector")} placeholder="اختر القطاع" options={list("sectors")} />
          </Field>
          <Field label="القيمة المستهدفة" required error={errors.target}>
            <Input type="number" min="1" value={form.target} onChange={set("target")} />
          </Field>
          <Field label="المسؤول" error={errors.owner_id}>
            <Select value={form.owner_id} onChange={set("owner_id")} placeholder="اختر المسؤول" options={list("employees")} />
          </Field>
        </div>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel="إضافة" />
      </form>
    </Modal>
  );
}

/** Updates the achieved value of one indicator: `indicator` = { id, code, achieved? }. */
export function IndicatorValueModal({ indicator, onClose }) {
  const [value, setValue] = useState(indicator.achieved ?? "");
  const [errors, setErrors] = useState({});
  const mutation = useIndicatorMutation(
    (body) => updateIndicator(indicator.id, body),
    "تم تحديث قيمة المؤشر.",
    onClose,
    setErrors,
  );

  const submit = (e) => {
    e.preventDefault();
    if (value === "" || Number(value) < 0) return setErrors({ achieved: "أدخل قيمة صحيحة" });
    mutation.mutate({ achieved: Number(value) });
  };

  return (
    <Modal open onClose={onClose} title={`تحديث المؤشر ${indicator.code ?? ""}`} maxWidth="440px">
      <form onSubmit={submit} noValidate>
        <Field label="القيمة المحققة" required error={errors.achieved}>
          <Input type="number" min="0" value={value} onChange={(e) => { setValue(e.target.value); setErrors({}); }} />
        </Field>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel="حفظ" />
      </form>
    </Modal>
  );
}
