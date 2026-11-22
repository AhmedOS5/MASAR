"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import styles from "./ui.module.css";

export default function Modal({ open, title, onClose, children, maxWidth }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  // Rendered into <body>: page containers keep a `transform` after their fade-in animation, which would otherwise
  // become the containing block of this `position: fixed` overlay and push the dialog out of the viewport.
  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={maxWidth ? { maxWidth } : undefined}
      >
        <div className={styles.modalHead}>
          <h3 id={titleId} className={styles.modalTitle}>{title}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="إغلاق النافذة">
            ×
          </button>
        </div>
        {/* Header stays put, the body scrolls, and the dialog's action row sticks to the bottom (ui.module.css). */}
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
