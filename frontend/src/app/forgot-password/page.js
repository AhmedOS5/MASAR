"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { forgotPassword } from "@/services/auth.service";
import AuthShell from "@/components/auth/AuthShell";
import { FieldError } from "@/components/auth/fields";
import styles from "@/components/auth/auth.module.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ForgotPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [banner, setBanner] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setEmailError("أدخل بريداً إلكترونياً صالحاً.");
      return;
    }

    setBusy(true);
    setEmailError("");
    setBanner("");
    try {
      const data = await forgotPassword(address);
      // Same destination whether or not the account exists: the answer never says. `wait` only starts the visible countdown.
      const wait = Number(data?.resend_after_seconds) || 0;
      router.push(`/reset-password?email=${encodeURIComponent(address)}&sent=1&wait=${wait}`);
    } catch (err) {
      if (err?.status === 422 && err.fieldErrors?.email) setEmailError(err.fieldErrors.email);
      else setBanner(err?.message || "تعذر إرسال الطلب. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  const resetHref = `/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`;

  return (
    <AuthShell
      title="نسيت كلمة المرور؟"
      subtitle="سنرسل رمزاً مكوّناً من 6 أرقام إلى بريدك الإلكتروني"
      cardTitle="استعادة الوصول إلى حسابك"
      cardSub="أدخل البريد الإلكتروني الذي تسجّل به الدخول. إن كان مرتبطاً بحساب مفعّل فسيصله رمز لإعادة تعيين كلمة المرور."
    >
      {banner && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {banner}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="fp-email" className={styles.label}>البريد الإلكتروني</label>
          <input
            id="fp-email"
            name="email"
            type="email"
            autoComplete="username"
            className={`${styles.input} ${styles.ltr}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError("");
            }}
            aria-invalid={Boolean(emailError)}
            disabled={busy}
            autoFocus
          />
          <FieldError>{emailError}</FieldError>
        </div>

        <button type="submit" className={styles.submit} disabled={busy || !email.trim()}>
          {busy ? <Loader2 size={18} /> : <Send size={18} />}
          <span>{busy ? "جاري الإرسال..." : "إرسال رمز إعادة التعيين"}</span>
        </button>
      </form>

      <p className={styles.footer}>
        لديك رمز بالفعل؟ <Link href={resetHref}>أدخل الرمز</Link>
        <br />
        تذكرت كلمة المرور؟ <Link href="/login">سجّل الدخول</Link>
      </p>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
