"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Field, FormActions, Textarea } from "@/components/ui/Form";
import useRequestMutations from "@/features/requests/useRequestMutations";
import usePermissions from "@/hooks/usePermissions";
import useSession from "@/hooks/useSession";
import styles from "../requestDetail.module.css";

export function RequestActions({ request }) {
  const m = useRequestMutations(request.id);
  const { can } = usePermissions();
  const { user } = useSession();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const decidable = request.status === "pending";
  // separation of duties: nobody decides a request they submitted (the backend refuses it too)
  const own = user?.id != null && request.requester?.id === user.id;
  const mayDecide = can("requests.approve") && !own;

  const submitReject = (e) => {
    e.preventDefault();
    m.reject.mutate(reason.trim(), {
      onSuccess: () => {
        setRejectOpen(false);
        setReason("");
      },
    });
  };

  return (
    <div className={styles.detailCard}>
      <h3 className={styles.sectionTitle}>الإجراءات</h3>
      <div className={styles.actionsGrid}>
        {can("requests.approve") && own && decidable && (
          <p role="note" className={styles.timelineTime}>
            لا يمكنك البت في طلب قدّمته بنفسك؛ يقرره شخص آخر (فصل المهام).
          </p>
        )}
        {mayDecide && (
          <button
            type="button"
            className={styles.approveBtn}
            disabled={!decidable || m.approve.isPending}
            onClick={() => m.approve.mutate()}
          >
            <CheckCircle2 size={16} />
            <span>{m.approve.isPending ? "جاري الموافقة..." : "الموافقة على الطلب"}</span>
          </button>
        )}
        {mayDecide && (
          <button
            type="button"
            className={styles.rejectBtn}
            disabled={!decidable}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle size={16} />
            <span>رفض الطلب</span>
          </button>
        )}
        {can("tasks.create") && (
        <button
          type="button"
          className={styles.taskBtn}
          disabled={m.createTask.isPending}
          onClick={() => m.createTask.mutate()}
        >
          {m.createTask.isPending ? "جاري الإنشاء..." : "إنشاء مهمة من الطلب"}
        </button>
        )}
      </div>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="رفض الطلب">
        <form onSubmit={submitReject}>
          <Field label="سبب الرفض" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
          <FormActions
            onCancel={() => setRejectOpen(false)}
            submitting={m.reject.isPending}
            submitLabel="تأكيد الرفض"
          />
        </form>
      </Modal>
    </div>
  );
}
