"use client";

import React, { useRef } from "react";
import { FileSpreadsheet, FileText, Plus } from "lucide-react";
import DeleteButton from "@/components/ui/DeleteButton";
import useTaskMutations from "@/features/tasks/useTaskMutations";
import { deleteTaskAttachment, taskAttachmentUrl } from "@/services/tasks.service";
import { fileKind } from "@/lib/format";
import styles from "../taskDetail.module.css";

export function TaskAttachments({ task }) {
  const m = useTaskMutations(task.id);
  const fileRef = useRef(null);
  const files = task.attachments ?? [];

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (file) m.upload.mutate(file);
    e.target.value = "";
  };

  return (
    <div className={styles.detailCard}>
      <h3 className={styles.sectionTitle}>المرفقات</h3>

      <div className={styles.filesList}>
        {files.length === 0 && <p className={styles.fileName}>لا توجد مرفقات.</p>}
        {files.map((file) => {
          const kind = fileKind(file.name, file.mime);
          return (
            <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <a
                className={styles.fileRow}
                href={taskAttachmentUrl(task.id, file.id)}
                download={file.name}
                style={{ textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}
              >
                <div className={styles.fileDetails}>
                  <span className={styles.fileName}>{file.name}</span>
                </div>
                <div className={`${styles.fileIconWrapper} ${kind === "xls" ? styles.fileIconXls : styles.fileIconDoc}`}>
                  {kind === "xls" ? (
                    <FileSpreadsheet size={16} />
                  ) : (
                    <FileText size={16} />
                  )}
                </div>
              </a>
              <DeleteButton
                label={`حذف المرفق ${file.name}`}
                title="حذف مرفق"
                message={`هل أنت متأكد من حذف "${file.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
                successText="تم حذف المرفق."
                mutationFn={() => deleteTaskAttachment(task.id, file.id)}
                onDone={m.refresh}
              />
            </div>
          );
        })}
      </div>

      <button type="button" className={styles.addAttachmentBtn} disabled={m.upload.isPending} onClick={() => fileRef.current?.click()}>
        <Plus size={14} />
        <span>{m.upload.isPending ? "جاري الرفع..." : "إضافة مرفق"}</span>
      </button>
      <input ref={fileRef} type="file" hidden onChange={onFile} />
    </div>
  );
}
