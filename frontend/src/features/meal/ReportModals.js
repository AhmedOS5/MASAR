"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import QueryState from "@/components/ui/QueryState";
import { Field, FormActions, Select, Input } from "@/components/ui/Form";
import useOptions from "@/hooks/useOptions";
import ProjectField from "@/features/projects/ProjectField";
import { createMealReport, listReportTemplates } from "@/services/meal.service";
import { useToast } from "@/components/Toast/ToastProvider";

export function ReportFormModal({ open, onClose, initial }) {
  const [form, setForm] = useState({
    title: initial?.name ?? "",
    type: initial?.type ?? "",
    project_id: "",
    period: "",
    template_id: initial?.id ?? "",
  });
  const [errors, setErrors] = useState({});
  const { list } = useOptions();
  const toast = useToast();
  const queryClient = useQueryClient();

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: createMealReport,
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal"] });
      toast.success("تم إنشاء التقرير كمسودة.");
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
    if (!form.title.trim()) local.title = "عنوان التقرير مطلوب";
    if (!form.type) local.type = "نوع التقرير مطلوب";
    if (!form.project_id) local.project_id = "المشروع مطلوب";
    if (Object.keys(local).length) return setErrors(local);
    mutation.mutate({ ...form, project_id: Number(form.project_id), template_id: form.template_id || null });
  };

  return (
    <Modal open={open} onClose={onClose} title="إنشاء تقرير">
      <form onSubmit={submit} noValidate>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="عنوان التقرير" required error={errors.title}>
            <Input value={form.title} onChange={set("title")} />
          </Field>
          <Field label="نوع التقرير" required error={errors.type}>
            <Select value={form.type} onChange={set("type")} placeholder="اختر النوع" options={list("report_types")} />
          </Field>
          <ProjectField value={form.project_id} onChange={set("project_id")} error={errors.project_id} />
          <Field label="الفترة" error={errors.period}>
            <Select value={form.period} onChange={set("period")} placeholder="اختر الفترة" options={list("periods")} />
          </Field>
        </div>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel="إنشاء" />
      </form>
    </Modal>
  );
}

/** GET /meal/report-templates -> [{ id, name, type, description }] ; choosing one pre-fills the create form. */
export function TemplatesDialog({ open, onClose, onUse }) {
  const query = useQuery({ queryKey: ["meal", "report-templates"], queryFn: listReportTemplates, enabled: open });
  return (
    <Modal open={open} onClose={onClose} title="قوالب التقارير">
      <QueryState query={query} isEmpty={(d) => d.length === 0} emptyText="لا توجد قوالب متاحة.">
        {(templates) => (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {templates.map((t) => (
              <li
                key={t.id}
                style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}
              >
                <div>
                  <strong>{t.name}</strong>
                  {t.description && <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{t.description}</p>}
                </div>
                <button type="button" onClick={() => onUse(t)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #2563eb", background: "#fff", color: "#2563eb", cursor: "pointer", fontFamily: "inherit" }}>
                  استخدام
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Modal>
  );
}
