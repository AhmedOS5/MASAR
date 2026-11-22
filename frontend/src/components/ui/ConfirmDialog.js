"use client";

import Modal from "./Modal";
import styles from "./ui.module.css";

export default function ConfirmDialog({
  open,
  title = "تأكيد",
  message,
  confirmLabel = "تأكيد",
  busy = false,
  tone = "danger", // "danger" | "primary" | "success": the colour of the confirm button
  onConfirm,
  onClose,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="440px">
      <p style={{ margin: "0 0 4px", lineHeight: 1.7 }}>{message}</p>
      <div className={styles.actions}>
        <button type="button" className={styles[`${tone}Btn`] || styles.dangerBtn} onClick={onConfirm} disabled={busy}>
          {busy ? "جاري التنفيذ..." : confirmLabel}
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={busy}>
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
