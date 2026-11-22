"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { setPassword } from "@/services/auth.service";
import { OTP_LENGTH, toOtpDigits } from "@/lib/otp";
import AuthShell from "@/components/auth/AuthShell";
import { FieldError, PasswordChecklist, checkPassword } from "@/components/auth/fields";
import styles from "@/components/auth/auth.module.css";

function SetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPasswordValue] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [locked, setLocked] = useState(false);

  const rules = checkPassword(password);
  const ready = email.trim() && code.length === OTP_LENGTH && password && confirmation && !locked;

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy || !ready) return;

    const local = {};
    if (!rules.every((r) => r.ok)) local.password = "كلمة المرور لا تستوفي الشروط الموضحة أدناه.";
    else if (password !== confirmation) local.confirmation = "كلمتا المرور غير متطابقتين.";
    if (Object.keys(local).length) {
      setFieldErrors(local);
      setBanner("");
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setBanner("");
    try {
      await setPassword({ email: email.trim(), code, password, passwordConfirmation: confirmation });
      router.push(`/login?activated=1&email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      const known = { email: err?.fieldErrors?.email, code: err?.fieldErrors?.code, password: err?.fieldErrors?.password };
      if (err?.status === 429) {
        // five wrong attempts: this invitation is dead until an admin sends a new one
        setLocked(true);
        setCode("");
        setBanner(err.message || "تجاوزت عدد المحاولات المسموح بها. اطلب من مدير المنظمة إرسال دعوة جديدة.");
      } else if (err?.status === 422 && Object.values(known).some(Boolean)) {
        setFieldErrors(known);
      } else {
        setBanner(err?.message || "تعذر تفعيل الحساب. حاول مرة أخرى.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="تفعيل حسابك"
      subtitle="أدخل رمز الدعوة الذي وصلك على بريدك واختر كلمة المرور"
      cardTitle="مرحباً بك في مسار"
      cardSub={`أضافك مدير مؤسستك إلى مساحة العمل. اكتب الرمز المكوّن من ${OTP_LENGTH} أرقام من رسالة الدعوة، ثم اختر كلمة المرور التي ستسجّل بها الدخول.`}
    >
      {banner && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {banner}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="sp-email" className={styles.label}>البريد الإلكتروني</label>
          <input
            id="sp-email"
            name="email"
            type="email"
            autoComplete="username"
            className={`${styles.input} ${styles.ltr}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((f) => ({ ...f, email: undefined }));
            }}
            aria-invalid={Boolean(fieldErrors.email)}
            disabled={busy}
          />
          <FieldError>{fieldErrors.email}</FieldError>
        </div>

        <div className={styles.field}>
          <label htmlFor="sp-code" className={styles.label}>رمز الدعوة ({OTP_LENGTH} أرقام)</label>
          <div className={styles.inputWrap}>
            <input
              id="sp-code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH + 2}
              dir="ltr"
              placeholder="······"
              className={`${styles.input} ${styles.codeInput}`}
              value={code}
              onChange={(e) => {
                setCode(toOtpDigits(e.target.value));
                setFieldErrors((f) => ({ ...f, code: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.code)}
              aria-describedby="sp-code-hint"
              disabled={busy || locked}
              autoFocus={Boolean(email)}
            />
          </div>
          <FieldError>{fieldErrors.code}</FieldError>
          <p id="sp-code-hint" className={styles.hint}>
            {locked
              ? "تجاوزت عدد المحاولات المسموح بها. اطلب من مدير المنظمة إرسال دعوة جديدة."
              : "لديك 5 محاولات. إن انتهت صلاحية الرمز أو ضاع فاطلب من مدير المنظمة إرسال دعوة جديدة."}
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor="sp-password" className={styles.label}>كلمة المرور الجديدة</label>
          <div className={styles.inputWrap}>
            <input
              id="sp-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className={`${styles.input} ${styles.passwordInput}`}
              value={password}
              onChange={(e) => {
                setPasswordValue(e.target.value);
                setFieldErrors((f) => ({ ...f, password: undefined, confirmation: undefined }));
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              disabled={busy}
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <FieldError>{fieldErrors.password}</FieldError>
        </div>

        <PasswordChecklist rules={rules} />

        <div className={styles.field}>
          <label htmlFor="sp-confirm" className={styles.label}>تأكيد كلمة المرور</label>
          <input
            id="sp-confirm"
            name="password_confirmation"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className={styles.input}
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value);
              setFieldErrors((f) => ({ ...f, confirmation: undefined }));
            }}
            aria-invalid={Boolean(fieldErrors.confirmation)}
            disabled={busy}
          />
          <FieldError>{fieldErrors.confirmation}</FieldError>
        </div>

        <button type="submit" className={styles.submit} disabled={busy || !ready}>
          {busy ? <Loader2 size={18} /> : <CheckCircle size={18} />}
          <span>{busy ? "جاري التفعيل..." : "تفعيل الحساب"}</span>
        </button>
      </form>

      <p className={styles.footer}>
        <KeyRound size={14} style={{ verticalAlign: "-2px" }} /> لا تشارك الرمز مع أي شخص. لديك حساب مفعّل؟{" "}
        <Link href="/login">سجّل الدخول</Link>
      </p>
    </AuthShell>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordContent />
    </Suspense>
  );
}
