"use client";

import React, { useRef, useState } from "react";
import { Send, Paperclip } from "lucide-react";
import useRequestMutations from "@/features/requests/useRequestMutations";
import { avatarColors, formatDateTime, initialOf } from "@/lib/format";
import styles from "../requestDetail.module.css";

export function RequestComments({ request }) {
  const m = useRequestMutations(request.id);
  const [text, setText] = useState("");
  const fileRef = useRef(null);
  const comments = request.comments ?? [];

  const send = () => {
    const body = text.trim();
    if (!body) return;
    m.comment.mutate(body, { onSuccess: () => setText("") });
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (file) m.upload.mutate(file);
    e.target.value = "";
  };

  return (
    <div className={styles.detailCard}>
      <h3 className={styles.sectionTitle}>التعليقات والتحديثات ({comments.length})</h3>

      <div className={styles.commentsList}>
        {comments.length === 0 && <p className={styles.commentText}>لا توجد تعليقات بعد.</p>}
        {comments.map((c) => {
          const name = c.author?.name ?? c.author_name ?? "—";
          return (
            <div key={c.id} className={styles.commentBox}>
              <div className={styles.commentContent}>
                <div className={styles.commentHeader}>
                  <span className={styles.commentTime}>{formatDateTime(c.created_at)}</span>
                  {c.author?.role && <span className={styles.commentRole}>{c.author.role}</span>}
                  <strong className={styles.commentName}>{name}</strong>
                </div>
                <p className={styles.commentText}>{c.body}</p>
              </div>
              <div className={styles.commentAvatar} style={avatarColors(name)}>
                {initialOf(name)}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.newCommentContainer}>
        <textarea
          placeholder="أضف تعليقاً أو تحديثاً..."
          aria-label="تعليق جديد"
          className={styles.commentInput}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.inputActions}>
          <button
            type="button"
            className={styles.sendBtn}
            disabled={!text.trim() || m.comment.isPending}
            onClick={send}
          >
            <Send size={14} />
            <span>{m.comment.isPending ? "جاري الإرسال..." : "إرسال التعليق"}</span>
          </button>
          <button
            type="button"
            className={styles.attachBtn}
            disabled={m.upload.isPending}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={14} />
            <span>{m.upload.isPending ? "جاري الرفع..." : "إرفاق ملف"}</span>
          </button>
          <input ref={fileRef} type="file" hidden onChange={onFile} />
        </div>
      </div>
    </div>
  );
}
