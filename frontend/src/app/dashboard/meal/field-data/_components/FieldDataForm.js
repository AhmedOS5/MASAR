"use client";

import React, { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, MapPin, Users, CheckCircle2, ChevronLeft } from "lucide-react";
import useOptions from "@/hooks/useOptions";
import useSession from "@/hooks/useSession";
import { projectOptions, useWorkProjects } from "@/features/projects/ProjectField";
import { STEPS } from "@/features/meal/useFieldRecordForm";
import { listIndicators } from "@/services/meal.service";
import { formatBytes } from "@/lib/format";
import styles from "./FieldDataForm.module.css";

const STEP_ICONS = [ClipboardList, MapPin, Users, CheckCircle2];
const asOption = (o) => (typeof o === "object" ? o : { value: o, label: o });

function Field({ label, required, error, full, children }) {
  const id = useId();
  return (
    <div className={`${styles.field} ${full ? styles.fieldFull : ""}`}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label} {required && <span className={styles.required}>*</span>}
      </label>
      {React.cloneElement(children, { id, "aria-invalid": error ? true : undefined })}
      {error && (
        <span role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
          {error}
        </span>
      )}
    </div>
  );
}

function SelectField({ label, name, form, options, required, placeholder }) {
  return (
    <Field label={label} required={required} error={form.errors[name]}>
      <select className={styles.select} value={form.values[name]} onChange={(e) => form.set(name, e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const opt = asOption(o);
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
    </Field>
  );
}

export default function FieldDataForm({ form }) {
  const { step, values, errors } = form;
  const { list } = useOptions();
  const { userName } = useSession();
  const projects = useWorkProjects();
  // the indicator a record measures is one of the chosen project
  const indicators = useQuery({
    queryKey: ["meal", "indicators", "picker", values.project_id],
    queryFn: () => listIndicators({ per_page: 100, project_id: values.project_id }),
    enabled: step >= 3 && Boolean(values.project_id),
  });
  const indicatorOptions = (indicators.data?.items ?? []).map((i) => ({
    value: i.id,
    label: `${i.code} — ${i.name}`,
  }));
  const selectedIndicator = (indicators.data?.items ?? []).find((i) => String(i.id) === String(values.indicator_id));

  return (
    <form
      className={styles.formCard}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 4) form.submit();
        else form.next();
      }}
    >
      <div className={styles.stepper}>
        {STEPS.map((label, idx) => {
          const Icon = STEP_ICONS[idx];
          const active = step === idx + 1;
          return (
            <div key={label} className={styles.step} aria-current={active ? "step" : undefined}>
              <div className={`${styles.stepCircle} ${active ? styles.stepCircleActive : ""}`}>
                <Icon size={18} />
              </div>
              <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ""}`}>{label}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.sectionHead}>
        <div className={styles.sectionTitleBlock}>
          <h3 className={styles.sectionTitle}>{STEPS[step - 1]}</h3>
          <span className={styles.sectionSubtitle}>
            {step === 1 && "حدد المشروع ونوع النشاط والبيانات الأساسية للسجل الميداني."}
            {step === 2 && "حدد المنطقة والموقع الذي نُفّذ فيه النشاط."}
            {step === 3 && "اربط النشاط بمؤشر وسجّل القيمة المحققة وعدد المستفيدين."}
            {step === 4 && "راجع البيانات ثم أرسل السجل."}
          </span>
        </div>
      </div>

      <div className={styles.fieldsGrid}>
        {step === 1 && (
          <>
            <SelectField label="المشروع" name="project_id" required form={form} options={projectOptions(projects.data)} placeholder="اختر المشروع" />
            <SelectField label="القطاع" name="sector" required form={form} options={list("sectors")} placeholder="اختر القطاع" />
            <SelectField label="نوع النشاط" name="activity_type" required form={form} options={list("activity_types")} placeholder="اختر نوع النشاط" />
            <Field label="تاريخ النشاط" required error={errors.activity_date}>
              <input type="date" className={styles.input} value={values.activity_date} onChange={(e) => form.set("activity_date", e.target.value)} />
            </Field>
            <Field label="مسؤول الإدخال" full>
              <input type="text" className={`${styles.input} ${styles.inputReadonly}`} value={userName} readOnly />
            </Field>
            <Field label="عنوان النشاط" full error={errors.title}>
              <input type="text" className={styles.input} value={values.title} onChange={(e) => form.set("title", e.target.value)} />
            </Field>
            <Field label="وصف النشاط" full error={errors.description}>
              <textarea
                className={styles.textarea}
                placeholder="اكتب وصفاً مختصراً لما تم تنفيذه في الميدان..."
                value={values.description}
                onChange={(e) => form.set("description", e.target.value)}
              />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <SelectField label="المنطقة" name="region" required form={form} options={list("regions")} placeholder="اختر المنطقة" />
            <Field label="الموقع / الحي" error={errors.location}>
              <input type="text" className={styles.input} value={values.location} onChange={(e) => form.set("location", e.target.value)} />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="المؤشر" required full error={errors.indicator_id}>
              <select className={styles.select} value={values.indicator_id} onChange={(e) => form.set("indicator_id", e.target.value)}>
                <option value="">{indicators.isPending ? "جاري تحميل المؤشرات..." : "اختر المؤشر"}</option>
                {indicatorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="القيمة المحققة" required error={errors.achieved_value}>
              <input type="number" min="0" className={styles.input} value={values.achieved_value} onChange={(e) => form.set("achieved_value", e.target.value)} />
            </Field>
            <Field label="إجمالي المستفيدين" error={errors.total_beneficiaries}>
              <input type="number" min="0" className={styles.input} value={values.total_beneficiaries} onChange={(e) => form.set("total_beneficiaries", e.target.value)} />
            </Field>
            {selectedIndicator && (
              <p className={styles.sectionSubtitle} style={{ gridColumn: "1 / -1" }}>
                المستهدف لهذا المؤشر: {selectedIndicator.target}
              </p>
            )}
            <Field label="المرفقات (PDF / JPG / PNG ≤ 5MB)" full>
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png"
                className={styles.input}
                onChange={(e) => {
                  form.addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </Field>
            {form.files.length > 0 && (
              <ul style={{ gridColumn: "1 / -1", margin: 0, paddingInlineStart: 18 }}>
                {form.files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    {f.name} ({formatBytes(f.size)}){" "}
                    <button type="button" onClick={() => form.removeFile(i)} style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer" }}>
                      إزالة
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {step === 4 && (
          <p className={styles.sectionSubtitle} style={{ gridColumn: "1 / -1" }}>
            تحقق من الملخص في اللوحة الجانبية. عند الإرسال سيُحدَّث المؤشر وتُضاف أرقام المستفيدين إلى الإحصائيات.
          </p>
        )}
      </div>

      <div className={styles.formActions}>
        <button type="submit" className={styles.btnNext} disabled={form.saving}>
          <span>{step === 4 ? (form.saving ? "جاري الإرسال..." : "إرسال السجل") : "التالي"}</span>
          {step < 4 && <ChevronLeft size={16} />}
        </button>
        {step > 1 && (
          <button type="button" className={styles.btnDraft} onClick={form.back} disabled={form.saving}>
            السابق
          </button>
        )}
        <button type="button" className={styles.btnDraft} onClick={form.saveDraft} disabled={form.saving}>
          حفظ كمسودة
        </button>
      </div>
    </form>
  );
}
