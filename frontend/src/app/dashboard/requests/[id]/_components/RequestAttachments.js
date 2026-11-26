"use client";

import React, { useRef } from "react";
import { FileSpreadsheet, FileText, Paperclip } from "lucide-react";
import DeleteButton from "@/components/ui/DeleteButton";
import useRequestMutations from "@/features/requests/useRequestMutations";
import { deleteRequestAttachment, requestAttachmentUrl } from "@/services/requests.service";
import { fileKind, formatBytes } from "@/lib/format";
import styles from "../requestDetail.module.css";

export function RequestAttachments({ request }) {
  const m = useRequestMutations(request.id);
  const fileRef = useRef(null);
  const files = request.attachments ?? [];

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (file) m.upload.mutate(file);
    e.target.value = "";
  };

  return (
    <div className={styles.detailCard}>
      <div className={styles.attachHeader}>
        <button
          type="button"
          className={styles.uploadBtn}
          disabled={m.upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip size={14} />
          <span>{m.upload.isPending ? "جاري الرفع..." : "رفع ملف"}</span>
        </button>
        <input ref={fileRef} type="file" hidden onChange={onFile} />
        <h3 className={styles.sectionTitle} style={{ margin: 0 }}>المرفقات</h3>
      </div>

      <div className={styles.filesGrid}>
        {files.length === 0 && <p className={styles.fileSize}>لا توجد مرفقات.</p>}
        {files.map((file) => {
          const kind = fileKind(file.name, file.mime);
          return (
            <div key={file.id} className={styles.fileRow}>
              <a
                className={styles.downloadLink}
                href={requestAttachmentUrl(request.id, file.id)}
                download={file.name}
              >
                تنزيل
              </a>
              <DeleteButton
                label={`حذف المرفق ${file.name}`}
                title="حذف مرفق"
                message={`هل أنت متأكد من حذف "${file.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
                successText="تم حذف المرفق."
                mutationFn={() => deleteRequestAttachment(request.id, file.id)}
                onDone={m.refresh}
              />
              <div className={styles.fileDetails}>
                <span className={styles.fileName}>{file.name}</span>
                <span className={styles.fileSize}>{formatBytes(file.size)}</span>
              </div>
              <div className={`${styles.fileIconWrapper} ${kind === "xls" ? styles.fileIconXls : styles.fileIconDoc}`}>
                {kind === "xls" ? (
                  <FileSpreadsheet size={18} />
                ) : (
                  <FileText size={18} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
