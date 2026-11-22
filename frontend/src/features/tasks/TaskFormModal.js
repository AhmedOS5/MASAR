"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/Form";
import useOptions from "@/hooks/useOptions";
import ProjectField from "@/features/projects/ProjectField";
import { getProject } from "@/services/projects.service";
import { createTask, updateTask } from "@/services/tasks.service";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { useToast } from "@/components/Toast/ToastProvider";

const PRIORITY_OPTIONS = Object.entries(PRIORITY).map(([value, { label }]) => ({ value, label }));
const STATUS_OPTIONS = Object.entries(TASK_STATUS).map(([value, { label }]) => ({ value, label }));

const fromTask = (t) => ({
  project_id: "",
  title: t?.title ?? "",
  description: t?.description ?? "",
  assignee_id: t?.assignee?.id ?? t?.assignee_id ?? "",
  department: t?.department ?? "",
  type: t?.type ?? "",
  priority: t?.priority ?? "medium",
  status: t?.status ?? "todo",
  due_date: (t?.due_date ?? "").slice(0, 10),
});

/**
 * Create (no `task`) or edit (`task` given). Remount with a `key` to reset the form.
 * A task always belongs to a project and can only be given to someone on its team: `projectId` + `assignees` when opened
 * from a project's page; otherwise the form asks for the project and offers that project's team.
 */
export default function TaskFormModal({ open, onClose, task, projectId, assignees }) {
  const editing = Boolean(task);
  const [form, setForm] = useState(() => fromTask(task));
  const [errors, setErrors] = useState({});
  const { list } = useOptions();
  const toast = useToast();
  const queryClient = useQueryClient();

  const project = task?.project_id ?? task?.project?.id ?? projectId ?? (form.project_id || null);
  const teamQuery = useQuery({ queryKey: ["project", String(project)], queryFn: () => getProject(project), enabled: !assignees && Boolean(project) });
  const team = assignees ?? (teamQuery.data?.members ?? []).map((m) => ({ value: m.user_id, label: m.name }));

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value, ...(k === "project_id" ? { assignee_id: "" } : {}) }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: (body) => (editing ? updateTask(task.id, body) : createTask(body)),
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "تم تحديث المهمة." : "تم إنشاء المهمة.");
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
    if (!editing && !project) local.project_id = "المشروع مطلوب";
    if (!form.title.trim()) local.title = "عنوان المهمة مطلوب";
    if (Object.keys(local).length) return setErrors(local);
    const body = { ...form, assignee_id: form.assignee_id || null, due_date: form.due_date || null };
    if (editing) delete body.project_id; // a task never changes project
    else {
      delete body.status;
      body.project_id = Number(project);
    }
    mutation.mutate(body);
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل المهمة" : "إضافة مهمة جديدة"}>
      <form onSubmit={submit} noValidate>
        <div style={{ display: "grid", gap: 14 }}>
          {!editing && !projectId && <ProjectField value={form.project_id} onChange={set("project_id")} error={errors.project_id} />}
          <Field label="عنوان المهمة" required error={errors.title}>
            <Input value={form.title} onChange={set("title")} />
          </Field>
          <Field label="الوصف" error={errors.description}>
            <Textarea value={form.description} onChange={set("description")} />
          </Field>
          <Field label="المسؤول" error={errors.assignee_id}>
            <Select value={form.assignee_id} onChange={set("assignee_id")} placeholder={project ? "اختر المسؤول" : "اختر المشروع أولاً"} options={team} disabled={!project} />
          </Field>
          <Field label="القسم" error={errors.department}>
            <Select value={form.department} onChange={set("department")} placeholder="اختر القسم" options={list("departments")} />
          </Field>
          <Field label="النوع" error={errors.type}>
            <Select value={form.type} onChange={set("type")} placeholder="اختر النوع" options={list("task_types")} />
          </Field>
          <Field label="الأولوية" error={errors.priority}>
            <Select value={form.priority} onChange={set("priority")} options={PRIORITY_OPTIONS} />
          </Field>
          {editing && (
            <Field label="الحالة" error={errors.status}>
              <Select value={form.status} onChange={set("status")} options={STATUS_OPTIONS} />
            </Field>
          )}
          <Field label="الموعد النهائي" error={errors.due_date}>
            <Input type="date" value={form.due_date} onChange={set("due_date")} />
          </Field>
        </div>
        <FormActions onCancel={onClose} submitting={mutation.isPending} submitLabel={editing ? "حفظ التعديلات" : "إنشاء المهمة"} />
      </form>
    </Modal>
  );
}
