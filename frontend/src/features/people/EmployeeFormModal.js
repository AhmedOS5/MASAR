"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { Field, FormActions, Input, Select } from "@/components/ui/Form";
import useOptions from "@/hooks/useOptions";
import { createEmployee, listJobCategories, listRoles, updateEmployee } from "@/services/people.service";
import { useToast } from "@/components/Toast/ToastProvider";

const STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "inactive", label: "غير نشط" },
];

const fromEmployee = (e) => ({
  name: e?.name ?? "",
  email: e?.email ?? "",
  phone: e?.phone ?? "",
  role_id: e?.role?.id ?? e?.role_id ?? "",
  job_title: e?.job_title ?? "",
  job_category: e?.job_category ?? "",
  department: e?.department ?? "",
  status: e?.status ?? "active",
});

/** An employee without a password is invited by e-mail: say so, so the admin knows what happens next. */
function successMessage({ editing, employee, body, saved }) {
  if (!editing) {
    return saved?.invite_pending && saved?.status === "active"
      ? "تمت إضافة الموظف، وأُرسل رمز التفعيل إلى بريده الإلكتروني."
      : "تمت إضافة الموظف.";
  }
  const reinvited = employee?.invite_pending && saved?.status === "active" && body.email !== employee.email;
  return reinvited ? "تم تحديث بيانات الموظف، وأُرسلت دعوة جديدة إلى بريده الجديد." : "تم تحديث بيانات الموظف.";
}

export default function EmployeeFormModal({ open, onClose, employee }) {
  const editing = Boolean(employee);
  const [initial] = useState(() => fromEmployee(employee));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const { list } = useOptions();
  const roles = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  // The category is optional and never blocks the form: if the catalog cannot be loaded the select is simply empty.
  const categories = useQuery({ queryKey: ["job-categories"], queryFn: listJobCategories, staleTime: 10 * 60_000 });
  const toast = useToast();
  const queryClient = useQueryClient();

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: (body) => (editing ? updateEmployee(employee.id, body) : createEmployee(body)),
    meta: { silent: true },
    onSuccess: (data, body) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["options"] });
      toast.success(successMessage({ editing, employee, body, saved: data?.data }));
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
    if (!form.name.trim()) local.name = "الاسم مطلوب";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) local.email = "بريد إلكتروني غير صالح";
    if (Object.keys(local).length) return setErrors(local);
    const body = { ...form, role_id: form.role_id || null, job_title: form.job_title.trim() || null };
    // No category picked = "let the job title decide" (an explicit null would override the title on the server).
    if (!form.job_category) delete body.job_category;
    // Editing: only send the role when the admin changed it. Re-sending the current role would pin it as "manual" and stop it
    // from following a new category.
    if (editing && String(form.role_id) === String(initial.role_id)) delete body.role_id;
    mutation.mutate(body);
  };

  const roleOptions = (roles.data ?? []).map((r) => ({ value: r.id, label: r.title }));
  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.key, label: c.label }));
  const chosen = (categories.data ?? []).find((c) => c.key === form.job_category);

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل موظف" : "إضافة موظف جديد"}>
      <form onSubmit={submit} noValidate>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="الاسم" required error={errors.name}>
            <Input value={form.name} onChange={set("name")} />
          </Field>
          <Field label="البريد الإلكتروني" required error={errors.email}>
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="رقم الجوال" error={errors.phone}>
            <Input type="tel" value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="المسمى الوظيفي" error={errors.job_title}>
            <Input value={form.job_title} onChange={set("job_title")} placeholder="مثال: محاسب، باحث ميداني، مدير برامج" />
          </Field>
          <Field label="الفئة الوظيفية" error={errors.job_category}>
            <Select value={form.job_category} onChange={set("job_category")} placeholder="حسب المسمى الوظيفي" options={categoryOptions} />
          </Field>
          {chosen && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ds-muted)" }} aria-live="polite">
              الدور التلقائي: <b>{chosen.role_title}</b> — {chosen.view.length} صلاحية اطلاع و{chosen.edit.length} صلاحية تعديل.
            </p>
          )}
          <Field label="الدور" error={errors.role_id}>
            <Select value={form.role_id} onChange={set("role_id")} placeholder="اختر الدور" options={roleOptions} />
          </Field>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ds-muted)" }}>
            اترك «الدور» فارغاً ليُعيَّن تلقائياً حسب الفئة. اختيار دور يدوياً يثبّته ولا يتغير بتغيير المسمى لاحقاً.
          </p>
          <Field label="القسم" error={errors.department}>
            <Select value={form.department} onChange={set("department")} placeholder="اختر القسم" options={list("departments")} />
          </Field>
          <Field label="الحالة" error={errors.status}>
            <Select value={form.status} onChange={set("status")} options={STATUS_OPTIONS} />
          </Field>
        </div>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel={editing ? "حفظ" : "إضافة"} />
      </form>
    </Modal>
  );
}
