"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Field, Textarea } from "@/components/ui/Form";
import ui from "@/components/ui/ui.module.css";
import { useToast } from "@/components/Toast/ToastProvider";
import { decideOrganization } from "@/services/platform.service";

const DONE = {
  approve: "تم اعتماد المؤسسة وإشعار مديرها.",
  activate: "تمت إعادة تفعيل المؤسسة.",
  reject: "تم رفض الطلب وإرسال السبب إلى المؤسسة.",
  suspend: "تم تعليق المؤسسة وإنهاء جلسات أعضائها.",
};

/** Confirms one decision on an organization: approve / activate (confirm only), reject (reason required), suspend. */
export default function DecisionDialog({ decision, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const decide = useMutation({
    mutationFn: ({ id, kind, why }) => decideOrganization(id, kind, why),
    onSuccess: (_d, { kind }) => {
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(DONE[kind]);
      close();
    },
  });

  function close() {
    setReason("");
    setError("");
    onClose();
  }

  if (!decision) return null;
  const { organization: org, kind } = decision;
  const run = (why) => decide.mutate({ id: org.id, kind, why });

  if (kind === "approve" || kind === "activate") {
    return (
      <ConfirmDialog
        open
        tone="primary"
        title={kind === "approve" ? "اعتماد مؤسسة" : "إعادة تفعيل مؤسسة"}
        message={
          kind === "approve"
            ? `سيتم اعتماد «${org.name}» وفتح مساحة العمل لأعضائها، ويصل إشعار بالبريد إلى مديرها.`
            : `سيتمكن أعضاء «${org.name}» من تسجيل الدخول واستخدام المنصة مجدداً.`
        }
        confirmLabel={kind === "approve" ? "اعتماد" : "تفعيل"}
        busy={decide.isPending}
        onConfirm={() => run()}
        onClose={close}
      />
    );
  }

  const isReject = kind === "reject";
  const submit = (e) => {
    e.preventDefault();
    const why = reason.trim();
    if (isReject && !why) {
      setError("سبب الرفض مطلوب، وسيُرسل إلى المؤسسة.");
      return;
    }
    run(why || undefined);
  };

  return (
    <Modal open title={isReject ? `رفض طلب «${org.name}»` : `تعليق «${org.name}»`} onClose={close} maxWidth="520px">
      <form onSubmit={submit} noValidate>
        <p style={{ margin: "0 0 14px", lineHeight: 1.7 }}>
          {isReject
            ? "لن تتمكن المؤسسة من الدخول إلى المنصة. يُرسل السبب إلى مديرها بالبريد، ويمكن اعتمادها لاحقاً."
            : "يُوقف دخول جميع أعضاء المؤسسة فوراً وتنتهي جلساتهم الحالية، إلى أن تُعيد تفعيلها."}
        </p>
        <Field label={isReject ? "سبب الرفض" : "سبب التعليق (اختياري)"} required={isReject} error={error}>
          <Textarea
            name="reason"
            maxLength={1000}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
          />
        </Field>
        <div className={ui.actions}>
          <button type="submit" className={ui.dangerBtn} disabled={decide.isPending}>
            {decide.isPending ? "جاري التنفيذ..." : isReject ? "رفض الطلب" : "تعليق المؤسسة"}
          </button>
          <button type="button" className={ui.secondaryBtn} onClick={close} disabled={decide.isPending}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}
