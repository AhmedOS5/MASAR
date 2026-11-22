"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Eye, EyeOff, Loader2, RotateCcw } from "lucide-react";
import { forgotPassword, resetPassword } from "@/services/auth.service";
import { OTP_LENGTH, toOtpDigits } from "@/lib/otp";
import AuthShell from "@/components/auth/AuthShell";
import { FieldError, PasswordChecklist, checkPassword } from "@/components/auth/fields";
import styles from "@/components/auth/auth.module.css";

const MAX_WAIT_SECONDS = 3600;

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSent = searchParams.get("sent") === "1";

  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPasswordValue] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [notice, setNotice] = useState(
    justSent ? "إذا كان البريد مرتبطاً بحساب مفعّل فقد أرسلنا إليه رمز إعادة التعيين. تحقق أيضاً من البريد غير الهام." : "",
  );
  const [locked, setLocked] = useState(false); // this code is used up: a new one is needed
  // seconds before another code may be requested (the server's own number, carried from the previous screen)
  const [timer, setTimer] = useState(() => (justSent ? Math.min(Math.max(Number(searchParams.get("wait")) || 0, 0), MAX_WAIT_SECONDS) : 0));

  useEffect(() => {
    if (timer <= 0) return undefined;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

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
    setNotice("");
    try {
      await resetPassword({ email: email.trim(), code, password, passwordConfirmation: confirmation });
      router.push(`/login?reset=1&email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      const known = { email: err?.fieldErrors?.email, code: err?.fieldErrors?.code, password: err?.fieldErrors?.password };
      if (err?.status === 429) {
        // five wrong attempts (or too many in the last hour): the code is no good any more, ask for a new one
        setLocked(true);
        setCode("");
        setBanner(err.message || "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً.");
      } else if (err?.status === 422 && Object.values(known).some(Boolean)) {
        setFieldErrors(known);
      } else {
        setBanner(err?.message || "تعذر تغيير كلمة المرور. حاول مرة أخرى.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (resending || timer > 0 || !email.trim()) return;
    setResending(true);
    setBanner("");
    setFieldErrors({});
    try {
      const data = await forgotPassword(email.trim());
      setNotice(data?.message || "إذا كان البريد مرتبطاً بحساب مفعّل فسيصله رمز جديد.");
      setTimer(Math.min(Number(data?.resend_after_seconds) || 0, MAX_WAIT_SECONDS));
      setCode("");
      setLocked(false); // a new code means fresh attempts
    } catch (err) {
      // "يرجى الانتظار 42 ثانية…" -> start the visible countdown from the server's number
      const wait = Number(/(\d+)\s*ثانية/.exec(err?.message ?? "")?.[1]);
      if (err?.status === 429 && wait > 0) setTimer(Math.min(wait, MAX_WAIT_SECONDS));
      setNotice("");
      setBanner(err?.message || "تعذر إرسال رمز جديد.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="إعادة تعيين كلمة المرور"
      subtitle="أدخل الرمز الذي وصلك على بريدك واختر كلمة مرور جديدة"
      cardTitle="اختر كلمة مرور جديدة"
      cardSub={`اكتب الرمز المكوّن من ${OTP_LENGTH} أرقام من رسالة إعادة التعيين. بعد التغيير تُنهى جميع جلسات الدخول السابقة.`}
    >
      {notice && (
        <div className={`${styles.banner} ${styles.bannerInfo}`} role="status">
          {notice}
        </div>
      )}
      {banner && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {banner}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="rp-email" className={styles.label}>البريد الإلكتروني</label>
          <input
            id="rp-email"
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
          <label htmlFor="rp-code" className={styles.label}>رمز إعادة التعيين ({OTP_LENGTH} أرقام)</label>
          <div className={styles.inputWrap}>
            <input
              id="rp-code"
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
              aria-describedby="rp-code-hint"
              disabled={busy || locked}
              autoFocus={Boolean(email)}
            />
          </div>
          <FieldError>{fieldErrors.code}</FieldError>
          <p id="rp-code-hint" className={styles.hint}>
            {locked
              ? "هذا الرمز لم يعد صالحاً. اطلب رمزاً جديداً بالزر أدناه."
              : "لديك 5 محاولات لكل رمز. الرمز صالح لمدة قصيرة ويُستخدم مرة واحدة."}
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor="rp-password" className={styles.label}>كلمة المرور الجديدة</label>
          <div className={styles.inputWrap}>
            <input
              id="rp-password"
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
          <label htmlFor="rp-confirm" className={styles.label}>تأكيد كلمة المرور</label>
          <input
            id="rp-confirm"
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
          <span>{busy ? "جاري التغيير..." : "تغيير كلمة المرور"}</span>
        </button>

        <button type="button" className={styles.secondary} onClick={handleResend} disabled={resending || timer > 0 || !email.trim()}>
          <RotateCcw size={16} />
          <span>{resending ? "جاري الإرسال..." : "إعادة إرسال الرمز"}</span>
          {timer > 0 && (
            <span className={styles.timer}>
              {String(Math.floor(timer / 60)).padStart(2, "0")}:{String(timer % 60).padStart(2, "0")}
            </span>
          )}
        </button>
      </form>

      <p className={styles.footer}>
        لا تشارك الرمز مع أي شخص. تذكرت كلمة المرور؟ <Link href="/login">سجّل الدخول</Link>
      </p>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
