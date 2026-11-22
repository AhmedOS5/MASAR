"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileText, MailWarning, Send } from "lucide-react";
import Modal from "@/components/ui/Modal";
import QueryState from "@/components/ui/QueryState";
import ui from "@/components/ui/ui.module.css";
import { useToast } from "@/components/Toast/ToastProvider";
import { getOrganization, organizationDocumentUrl, resendAdminVerification } from "@/services/platform.service";
import { CODE_KIND, ORG_TYPE } from "@/lib/labels";
import { formatBytes, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { StatusBadge, quickActionFor } from "./OrganizationsPanel";
import styles from "../operator.module.css";

function Row({ label, children }) {
  return (
    <div className={styles.dlRow}>
      <dt>{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}

/** The admin's e-mail verification state. The code is stored only as a keyed hash, so it can be re-sent, never shown. */
function AdminAccount({ account, orgId }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const resend = useMutation({
    mutationFn: () => resendAdminVerification(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform", "organization", orgId] });
      toast.success("تم إرسال رمز تحقق جديد إلى بريد المدير.");
    },
  });
  const c = account.code;
  const canResend = !account.verified && account.has_password;

  return (
    <div className={styles.account}>
      <div className={styles.accountHead}>
        <div>
          <div className={ui.cellMain}>{account.name}</div>
          <div className={ui.cellSub} dir="ltr">
            {account.email}
          </div>
        </div>
        {account.verified ? (
          <span className={`${ui.badge} ${ui.badge_success}`}>البريد مؤكد</span>
        ) : (
          <span className={`${ui.badge} ${ui.badge_warning}`}>البريد غير مؤكد</span>
        )}
      </div>
      <dl className={styles.dl}>
        <Row label="تأكيد البريد">{account.verified ? formatDateTime(account.verified_at) : "لم يُؤكَّد بعد"}</Row>
        <Row label="آخر دخول">{account.last_login_at ? formatDateTime(account.last_login_at) : "لم يسجّل الدخول بعد"}</Row>
        <Row label="رمز التحقق">
          {c.active ? (
            <span>
              فعّال · {CODE_KIND[c.kind] ?? c.kind} · ينتهي {formatDateTime(c.expires_at)}
            </span>
          ) : c.sent_at ? (
            "منتهي أو مستخدَم"
          ) : (
            "لا يوجد رمز"
          )}
        </Row>
        {c.sent_at && <Row label="آخر إرسال">{formatDateTime(c.sent_at)}</Row>}
        {c.active && <Row label="محاولات خاطئة">{formatNumber(c.attempts)}</Row>}
      </dl>
      <p className={styles.securityNote}>
        <MailWarning size={14} aria-hidden="true" /> لأسباب أمنية لا يُخزَّن رمز التحقق ولا يمكن عرضه. يمكنك إرسال رمز جديد
        إلى بريد المدير، ويُلغي الرمز الجديد أي رمز سابق.
      </p>
      {canResend && (
        <button
          type="button"
          className={`${ui.secondaryBtn} ${ui.smallBtn}`}
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
        >
          <Send size={14} aria-hidden="true" />
          {resend.isPending ? "جاري الإرسال..." : "إرسال رمز تحقق جديد"}
        </button>
      )}
    </div>
  );
}

export default function OrganizationReview({ id, onClose, onDecide }) {
  const query = useQuery({
    queryKey: ["platform", "organization", id],
    queryFn: () => getOrganization(id),
    enabled: id != null,
  });

  return (
    <Modal open={id != null} title="مراجعة مؤسسة" onClose={onClose} maxWidth="760px">
      <QueryState query={query} rows={6}>
        {(o) => {
          const action = quickActionFor(o.status);
          const p = o.profile;
          return (
            <div className={styles.review}>
              <div className={styles.reviewHead}>
                <div>
                  <h4 className={styles.reviewName}>{o.name}</h4>
                  <div className={ui.cellSub}>
                    {ORG_TYPE[o.type] ?? o.type} · سُجّلت في {formatDate(o.created_at)}
                    {o.submitted_at ? ` · أُرسل ملفها في ${formatDate(o.submitted_at)}` : ""}
                  </div>
                </div>
                <StatusBadge status={o.status} />
              </div>

              {o.rejection_reason && (
                <div className={styles.reasonBox} role="note">
                  <strong>{o.status === "rejected" ? "سبب الرفض: " : "سبب التعليق: "}</strong>
                  {o.rejection_reason}
                </div>
              )}

              <div className={styles.miniStats}>
                <div>
                  <span className={styles.miniLabel}>الموظفون</span>
                  <span className={styles.miniValue}>{formatNumber(o.employees_count ?? 0)}</span>
                </div>
                <div>
                  <span className={styles.miniLabel}>المستفيدون</span>
                  <span className={styles.miniValue}>{formatNumber(o.beneficiaries_reached ?? 0)}</span>
                </div>
                <div>
                  <span className={styles.miniLabel}>الوثائق</span>
                  <span className={styles.miniValue}>{formatNumber(o.documents?.length ?? 0)}</span>
                </div>
              </div>

              <section className={styles.reviewSection}>
                <h5 className={styles.sectionTitle}>بيانات التواصل</h5>
                <dl className={styles.dl}>
                  <Row label="البريد الرسمي">
                    <span dir="ltr">{o.email}</span>
                  </Row>
                  <Row label="الهاتف">{o.phone && <span dir="ltr">{o.phone}</span>}</Row>
                  <Row label="المنطقة">{o.region}</Row>
                  {o.approved_at && <Row label="تاريخ الاعتماد">{formatDate(o.approved_at)}</Row>}
                </dl>
              </section>

              <section className={styles.reviewSection}>
                <h5 className={styles.sectionTitle}>ملف المؤسسة</h5>
                {p ? (
                  <dl className={styles.dl}>
                    <Row label="رقم التسجيل">{p.registration_number}</Row>
                    <Row label="الدولة">{p.country}</Row>
                    <Row label="العنوان">{p.address}</Row>
                    <Row label="مسؤول التواصل">{p.contact_person_name}</Row>
                    <Row label="القطاعات">{p.sectors?.length ? p.sectors.join("، ") : null}</Row>
                    <Row label="حجم المؤسسة">{p.organization_size}</Row>
                    <Row label="سنوات الخبرة">{p.years_of_experience != null ? formatNumber(p.years_of_experience) : null}</Row>
                    {p.notes && <Row label="ملاحظات">{p.notes}</Row>}
                  </dl>
                ) : (
                  <p className={styles.muted}>لم تُرسل المؤسسة ملفها بعد.</p>
                )}
              </section>

              <section className={styles.reviewSection}>
                <h5 className={styles.sectionTitle}>الوثائق الرسمية</h5>
                {o.documents?.length ? (
                  <ul className={styles.docs}>
                    {o.documents.map((d) => (
                      <li key={d.id}>
                        <FileText size={16} aria-hidden="true" />
                        <span className={styles.docName}>{d.name}</span>
                        <span className={styles.muted}>{formatBytes(d.size)}</span>
                        <a className={`${ui.ghostBtn} ${ui.smallBtn}`} href={organizationDocumentUrl(o.id, d.id)} aria-label={`تنزيل ${d.name}`}>
                          <Download size={14} aria-hidden="true" /> تنزيل
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>لا توجد وثائق مرفوعة.</p>
                )}
              </section>

              <section className={styles.reviewSection}>
                <h5 className={styles.sectionTitle}>حساب المدير والتحقق</h5>
                {o.admin_accounts?.length ? (
                  o.admin_accounts.map((a) => <AdminAccount key={a.id} account={a} orgId={o.id} />)
                ) : (
                  <p className={styles.muted}>لا يوجد حساب مدير لهذه المؤسسة.</p>
                )}
              </section>

              <div className={ui.actions}>
                {o.status === "pending_approval" && (
                  <>
                    <button type="button" className={ui.successBtn} onClick={() => onDecide({ organization: o, kind: "approve" })}>
                      <CheckCircle2 size={16} aria-hidden="true" /> اعتماد المؤسسة
                    </button>
                    <button type="button" className={ui.dangerBtn} onClick={() => onDecide({ organization: o, kind: "reject" })}>
                      رفض الطلب
                    </button>
                  </>
                )}
                {action && o.status !== "pending_approval" && (
                  <button
                    type="button"
                    className={action.kind === "suspend" ? ui.dangerBtn : ui.primaryBtn}
                    onClick={() => onDecide({ organization: o, kind: action.kind })}
                  >
                    {action.kind === "suspend" ? "تعليق المؤسسة" : "إعادة تفعيل المؤسسة"}
                  </button>
                )}
                <button type="button" className={ui.secondaryBtn} onClick={onClose}>
                  إغلاق
                </button>
              </div>
            </div>
          );
        }}
      </QueryState>
    </Modal>
  );
}
