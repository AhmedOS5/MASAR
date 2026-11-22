"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import { Field, FormActions, Input, Select, Textarea } from "@/components/ui/Form";
import ui from "@/components/ui/ui.module.css";
import { beneficiaryAttachmentUrl, createBeneficiary, getBeneficiary, updateBeneficiary, uploadBeneficiaryAttachment } from "@/services/projects.service";
import { BENEFICIARY_STATUS, GENDER } from "@/lib/labels";
import { formatBytes } from "@/lib/format";
import { useToast } from "@/components/Toast/ToastProvider";
import useOptions from "@/hooks/useOptions";
import styles from "@/app/dashboard/projects/projects.module.css";

const STATUS_OPTIONS = Object.entries(BENEFICIARY_STATUS).map(([value, { label }]) => ({ value, label }));
const GENDER_OPTIONS = Object.entries(GENDER).map(([value, label]) => ({ value, label }));

const fromBeneficiary = (b) => ({
  full_name: b?.full_name ?? "",
  national_id: b?.national_id ?? "",
  gender: b?.gender ?? "",
  birth_date: (b?.birth_date ?? "").slice(0, 10),
  phone: b?.phone ?? "",
  region: b?.region ?? "",
  address: b?.address ?? "",
  household_size: b?.household_size ?? "",
  notes: b?.notes ?? "",
  status: b?.status ?? "active",
});

/**
 * Register (no `beneficiary`) or edit one of the project's beneficiaries. `canEdit` false = read-only view
 * (beneficiaries.view without beneficiaries.edit). When editing, the beneficiary's file (documents, photos) is below the form.
 */
export default function BeneficiaryFormModal({ open, onClose, projectId, beneficiary, canEdit = true }) {
  const editing = Boolean(beneficiary);
  const [form, setForm] = useState(() => fromBeneficiary(beneficiary));
  const [errors, setErrors] = useState({});
  const { list } = useOptions();
  const fileRef = useRef(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const detail = useQuery({ queryKey: ["beneficiary", beneficiary?.id], queryFn: () => getBeneficiary(beneficiary.id), enabled: editing });

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const save = useMutation({
    mutationFn: (body) => (editing ? updateBeneficiary(beneficiary.id, body) : createBeneficiary(projectId, body)),
    meta: { silent: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      toast.success(editing ? "تم تحديث بيانات المستفيد." : "تم تسجيل المستفيد.");
      onClose();
    },
    onError: (err) => {
      setErrors(err.fieldErrors || {});
      toast.error(err.message);
    },
  });

  const attach = useMutation({
    mutationFn: (file) => uploadBeneficiaryAttachment(beneficiary.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiary", beneficiary.id] });
      toast.success("تم رفع الملف إلى ملف المستفيد.");
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) return setErrors({ full_name: "اسم المستفيد مطلوب" });
    save.mutate({ ...form, full_name: form.full_name.trim() });
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? (canEdit ? "بيانات المستفيد" : "ملف المستفيد") : "تسجيل مستفيد"}>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
          <Field label="الاسم الكامل" required error={errors.full_name}>
            <Input value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="رقم الهوية" error={errors.national_id}>
            <Input value={form.national_id} onChange={set("national_id")} inputMode="numeric" />
          </Field>
          <Field label="الجنس" error={errors.gender}>
            <Select value={form.gender} onChange={set("gender")} placeholder="غير محدد" options={GENDER_OPTIONS} />
          </Field>
          <Field label="تاريخ الميلاد" error={errors.birth_date}>
            <Input type="date" value={form.birth_date} onChange={set("birth_date")} />
          </Field>
          <Field label="رقم الجوال" error={errors.phone}>
            <Input value={form.phone} onChange={set("phone")} inputMode="tel" />
          </Field>
          <Field label="المنطقة" error={errors.region}>
            <Select value={form.region} onChange={set("region")} placeholder="اختر المنطقة" options={list("regions")} />
          </Field>
          <Field label="العنوان" error={errors.address}>
            <Input value={form.address} onChange={set("address")} />
          </Field>
          <Field label="عدد أفراد الأسرة" error={errors.household_size}>
            <Input type="number" min="0" value={form.household_size} onChange={set("household_size")} />
          </Field>
          <Field label="ملاحظات" error={errors.notes}>
            <Textarea value={form.notes} onChange={set("notes")} />
          </Field>
          {editing && (
            <Field label="الحالة" error={errors.status}>
              <Select value={form.status} onChange={set("status")} options={STATUS_OPTIONS} />
            </Field>
          )}
        </fieldset>

        {editing && (
          <div style={{ marginTop: 16 }}>
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>ملف المستفيد (وثائق وصور)</h3>
              {canEdit && (
                <>
                  <button type="button" className={ui.secondaryBtn} disabled={attach.isPending} onClick={() => fileRef.current?.click()}>
                    {attach.isPending ? "جاري الرفع..." : "رفع وثيقة أو صورة"}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) attach.mutate(f);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </div>
            <ul className={styles.list}>
              {(detail.data?.attachments ?? []).length === 0 && <li className={styles.note}>لا توجد ملفات مرفقة.</li>}
              {(detail.data?.attachments ?? []).map((a) => (
                <li key={a.id} className={styles.row}>
                  <a href={beneficiaryAttachmentUrl(beneficiary.id, a.id)} className={styles.rowLink}>
                    <span className={styles.rowTitle}>{a.name}</span>
                  </a>
                  <span className={styles.rowSub}>{formatBytes(a.size)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canEdit ? (
          <FormActions onCancel={onClose} submitting={save.isPending} submitLabel={editing ? "حفظ التعديلات" : "تسجيل المستفيد"} />
        ) : (
          <div className={ui.actions}>
            <button type="button" className={ui.secondaryBtn} onClick={onClose}>
              إغلاق
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
