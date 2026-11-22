"use client";

import { cloneElement, isValidElement, useId } from "react";
import styles from "./ui.module.css";

/** Label + control + inline server/validation error, wired with htmlFor/aria. */
export function Field({ label, error, full, required, children }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? `${id}-err` : undefined,
      })
    : children;
  return (
    <div className={`${styles.field} ${full ? styles.full : ""}`}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {child}
      {error && (
        <span id={`${id}-err`} className={styles.fieldError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export const Input = (props) => <input className={styles.input} {...props} />;
export const Textarea = (props) => <textarea className={styles.textarea} {...props} />;

export function Select({ placeholder, options = [], ...props }) {
  return (
    <select className={styles.select} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === "object" ? o : { value: o, label: o };
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function FormActions({ onCancel, submitting, submitLabel = "حفظ" }) {
  return (
    <div className={styles.actions}>
      <button type="submit" className={styles.primaryBtn} disabled={submitting}>
        {submitting ? "جاري الحفظ..." : submitLabel}
      </button>
      {onCancel && (
        <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={submitting}>
          إلغاء
        </button>
      )}
    </div>
  );
}

export { styles as formStyles };
