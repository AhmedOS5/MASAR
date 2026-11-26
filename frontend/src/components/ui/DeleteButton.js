"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import ui from "./ui.module.css";
import { useToast } from "@/components/Toast/ToastProvider";

/**
 * A delete button that asks first. `mutationFn` performs the DELETE; a failure is toasted by the shared mutation cache
 * (e.g. the server's 403 when the item was added by someone else), and the dialog closes either way.
 * Icon-only unless `text` is given; `label` is always the accessible name.
 */
export default function DeleteButton({ label, title = "تأكيد الحذف", message, text, successText = "تم الحذف.", mutationFn, onDone, disabled = false }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const remove = useMutation({
    mutationFn,
    onSuccess: () => {
      toast.success(successText);
      onDone?.();
    },
    onSettled: () => setOpen(false),
  });

  return (
    <>
      <button type="button" className={ui.ghostBtn} aria-label={label} title={label} disabled={disabled} onClick={() => setOpen(true)}>
        <Trash2 size={14} aria-hidden="true" />
        {text && <span>{text}</span>}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        confirmLabel="حذف"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
