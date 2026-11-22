"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveFieldRecord } from "@/services/meal.service";
import { useToast } from "@/components/Toast/ToastProvider";

export const STEPS = ["معلومات النشاط", "الموقع", "المؤشرات والمستفيدين", "المراجعة والإرسال"];
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export const EMPTY_RECORD = {
  project_id: "",
  sector: "",
  activity_type: "",
  activity_date: "",
  title: "",
  description: "",
  region: "",
  location: "",
  indicator_id: "",
  achieved_value: "",
  total_beneficiaries: "",
};

/** Required fields per step (1-based). Returns { field: message }. */
export function validateStep(step, v) {
  const e = {};
  if (step === 1) {
    if (!v.project_id) e.project_id = "المشروع مطلوب";
    if (!v.sector) e.sector = "القطاع مطلوب";
    if (!v.activity_type) e.activity_type = "نوع النشاط مطلوب";
    if (!v.activity_date) e.activity_date = "تاريخ النشاط مطلوب";
  }
  if (step === 2) {
    if (!v.region) e.region = "المنطقة مطلوبة";
  }
  if (step === 3) {
    if (!v.indicator_id) e.indicator_id = "اختر المؤشر";
    if (v.achieved_value === "" || Number(v.achieved_value) < 0) e.achieved_value = "أدخل القيمة المحققة";
    if (v.total_beneficiaries !== "" && Number(v.total_beneficiaries) < 0) e.total_beneficiaries = "قيمة غير صالحة";
  }
  return e;
}

export default function useFieldRecordForm() {
  const [step, setStep] = useState(1);
  const [values, setValues] = useState(EMPTY_RECORD);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const toast = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setStep(1);
    setValues(EMPTY_RECORD);
    setFiles([]);
    setErrors({});
  };

  const save = useMutation({
    mutationFn: ({ status }) => saveFieldRecord({ ...values, status }, files),
    meta: { silent: true },
    onSuccess: (_d, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["meal"] });
      toast.success(status === "draft" ? "تم حفظ المسودة." : "تم إرسال السجل الميداني.");
      reset();
    },
    onError: (err) => {
      setErrors(err.fieldErrors || {});
      toast.error(err.message);
    },
  });

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value, ...(name === "project_id" ? { indicator_id: "" } : {}) }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const addFiles = (list) => {
    const accepted = [];
    const problems = [];
    for (const f of Array.from(list)) {
      if (!ALLOWED_TYPES.includes(f.type)) problems.push(`${f.name}: نوع الملف غير مدعوم`);
      else if (f.size > MAX_FILE_BYTES) problems.push(`${f.name}: يتجاوز 5MB`);
      else accepted.push(f);
    }
    if (problems.length) toast.error(problems.join(" • "));
    setFiles((cur) => [...cur, ...accepted]);
  };

  const next = () => {
    const e = validateStep(step, values);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(4, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = () => {
    for (const s of [1, 2, 3]) {
      const e = validateStep(s, values);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        return;
      }
    }
    save.mutate({ status: "submitted" });
  };

  const saveDraft = () => save.mutate({ status: "draft" });

  return {
    step,
    values,
    files,
    errors,
    saving: save.isPending,
    set,
    addFiles,
    removeFile: (i) => setFiles((cur) => cur.filter((_, idx) => idx !== i)),
    next,
    back,
    submit,
    saveDraft,
    reset,
  };
}
