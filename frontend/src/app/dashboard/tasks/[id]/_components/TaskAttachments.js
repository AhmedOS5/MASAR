"use client";

import React, { useRef } from "react";
import { FileSpreadsheet, FileText, Plus } from "lucide-react";
import useTaskMutations from "@/features/tasks/useTaskMutations";
import { taskAttachmentUrl } from "@/services/tasks.service";
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
            <a
              key={file.id}
              className={styles.fileRow}
              href={taskAttachmentUrl(task.id, file.id)}
              download={file.name}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className={styles.fileDetails}>
                <span className={styles.fileName}>{file.name}</span>
              </div>
              <div
                className={styles.fileIconWrapper}
                style={{ backgroundColor: kind === "xls" ? "#ecfdf5" : "#eff6ff" }}
              >
                {kind === "xls" ? (
                  <FileSpreadsheet size={16} color="#059669" />
                ) : (
                  <FileText size={16} color="#2563eb" />
                )}
              </div>
            </a>
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
