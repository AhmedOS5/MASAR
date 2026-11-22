import React from "react";
import styles from "./auth.module.css";

// Same rules as the registration form and the backend (>= 8 characters, a digit, a symbol).
const RULES = [
  { key: "length", label: "8 أحرف على الأقل", test: (p) => p.length >= 8 },
  { key: "digit", label: "رقم واحد على الأقل", test: (p) => /[0-9]/.test(p) },
  { key: "symbol", label: "رمز خاص واحد على الأقل", test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

/** The password rules with a flag for each one the given password satisfies. */
export const checkPassword = (password) => RULES.map((r) => ({ key: r.key, label: r.label, ok: r.test(password) }));

/** Live checklist under the password field. */
export function PasswordChecklist({ rules }) {
  return (
    <ul className={styles.reqs} aria-label="شروط كلمة المرور">
      {rules.map((r) => (
        <li key={r.key} className={r.ok ? styles.reqOk : undefined}>
          {r.ok ? "✓" : "○"} {r.label}
        </li>
      ))}
    </ul>
  );
}

export const FieldError = ({ children }) =>
  children ? (
    <p className={styles.fieldError} role="alert">
      {children}
    </p>
  ) : null;
