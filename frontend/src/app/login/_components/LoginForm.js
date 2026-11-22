"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Eye, EyeOff, LogIn, Info, CheckCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loginAdmin } from "@/services/auth.service";
import { safeNextPath } from "@/lib/session";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "../../_components/Navbar/Logo";
import styles from "./LoginForm.module.css";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Coming from /set-password (account activated) or /reset-password (password changed): a confirmation is shown and the
  // e-mail is pre-filled. A bare ?email= is ignored, so an arbitrary link cannot fill the form.
  const activated = searchParams.get("activated") === "1";
  const passwordReset = searchParams.get("reset") === "1";
  const [email, setEmail] = useState(() => (activated || passwordReset ? (searchParams.get("email") ?? "") : ""));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");
  // 403 "verify your e-mail first": offer the way to the 6-digit code screen (the code may have expired by now)
  const [needsVerification, setNeedsVerification] = useState(false);
  const [blocked, setBlocked] = useState(null); // { status: "rejected" | "suspended", reason } of the user's organization
  const [successOverlay, setSuccessOverlay] = useState(false);

  const login = useMutation({
    mutationFn: loginAdmin,
    meta: { silent: true }, // the error is shown inline in the form banner
    onSuccess: (data) => {
      queryClient.clear(); // drop any cached data from a previous account
      setErrorMessage("");
      setSuccessOverlay(true);
      const target =
        data?.redirect === "/dashboard"
          ? safeNextPath(searchParams.get("next"), "/dashboard")
          : data?.redirect || "/dashboard";
      setTimeout(() => router.replace(target), 800);
    },
    onError: (error) => {
      // A rejected / suspended organization: the server (after the password was right) says which, and why.
      const status = error?.status === 403 ? error?.data?.organization_status : null;
      setBlocked(status ? { status, reason: error.data.reason ?? null } : null);
      setNeedsVerification(error?.status === 403 && /تفعيل البريد/.test(error?.message ?? ""));
      setErrorMessage(
        error?.status === 401 || error?.status === 422
          ? error.message || "بيانات الدخول غير صحيحة."
          : error?.message || "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.",
      );
    },
  });
  const loading = login.isPending;

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage("");
    setNeedsVerification(false);
    setBlocked(null);
    login.mutate({ email: email.trim(), password, remember: rememberMe });
  };

  return (
    <>
      {mounted && loading && createPortal(
        <div className={styles.loadingOverlay}>
          <div className={styles.spinnerContainer}>
            <div className={styles.spinner}></div>
            <h3 className={styles.loadingText}>جاري التحقق من هويتك...</h3>
            <p className={styles.loadingSubtext}>الرجاء الانتظار قليلاً</p>
          </div>
        </div>,
        document.body
      )}

      {mounted && successOverlay && createPortal(
        <div className={styles.loadingOverlay}>
          <div className={styles.successContainer}>
            <div className={styles.successCircle}>
              <CheckCircle size={40} className={styles.successCheckIcon} />
            </div>
            <h3 className={styles.successText}>تم الدخول بنجاح!</h3>
            <p className={styles.loadingSubtext}>جاري نقلك إلى مساحة العمل الشاملة...</p>
          </div>
        </div>,
        document.body
      )}

      <div className={styles.formWrapper}>
        <div className={`${styles.logoBox} ${styles.animateFadeUp}`}>
          <Link href="/" aria-label="العودة إلى الصفحة الرئيسية">
            <Logo width="160px" height="auto" />
          </Link>
        </div>

        <h2 className={`${styles.formTitle} ${styles.animateFadeUp} ${styles.delay1}`}>
          تسجيل الدخول
        </h2>
        <p className={`${styles.formSubtitle} ${styles.animateFadeUp} ${styles.delay1}`}>
          الرجاء إدخال بيانات الدخول الخاصة بك للمتابعة إلى مساحة العمل.
        </p>

        <form onSubmit={handleSubmit} className={`${styles.mainForm} ${styles.animateFadeUp} ${styles.delay2}`}>
          {(activated || passwordReset) && !errorMessage && (
            <div className={styles.successAlert} role="status">
              <CheckCircle size={18} className={styles.successIcon} />
              <span>
                {passwordReset
                  ? "تم تغيير كلمة المرور وإنهاء جميع الجلسات السابقة. سجّل الدخول بكلمة المرور الجديدة."
                  : "تم تفعيل حسابك. سجّل الدخول بكلمة المرور التي اخترتها."}
              </span>
            </div>
          )}

          {errorMessage && (
            <div className={styles.errorAlert} role="alert">
              {blocked ? (
                <>
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    {blocked.status === "rejected" ? "تم رفض طلب تسجيل منظمتك" : "تم تعليق حساب منظمتك"}
                  </strong>
                  <span style={{ display: "block" }}>{blocked.reason ? `السبب: ${blocked.reason}` : "لم يُذكر سبب. تواصل مع الدعم للاستفسار."}</span>
                  {blocked.status === "rejected" && <span style={{ display: "block" }}>يمكنك التواصل مع الدعم بعد معالجة الملاحظات لإعادة النظر في الطلب.</span>}
                  {SUPPORT_EMAIL && (
                    <a className={styles.verifyLink} href={`mailto:${SUPPORT_EMAIL}`}>
                      مراسلة الدعم: {SUPPORT_EMAIL}
                    </a>
                  )}
                </>
              ) : (
                errorMessage
              )}
              {needsVerification && (
                <>
                  {" "}
                  <Link href={`/verify-email?email=${encodeURIComponent(email.trim())}&resend=1`} className={styles.verifyLink}>
                    إدخال رمز التحقق أو طلب رمز جديد
                  </Link>
                </>
              )}
            </div>
          )}


          <div className={styles.inputGroup}>
            <label htmlFor="login-email" className={styles.inputLabel}>البريد الإلكتروني</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@organization.org"
              className={styles.textInput}
              required
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="login-password" className={styles.inputLabel}>كلمة المرور</label>
            <div className={styles.passwordContainer}>
              <input
                id="login-password"
                name="password"
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className={styles.passwordInput}
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className={styles.eyeButton}
                aria-label="Toggle password visibility"
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className={styles.controlsRow}>
            <Link
              href={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}
              className={styles.forgotLink}
            >
              نسيت كلمة المرور؟
            </Link>

            <label className={styles.rememberLabel}>
              <span>تذكرني</span>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={styles.checkboxInput}
                disabled={loading}
              />
            </label>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            <span>{loading ? "جاري التحقق..." : "دخول الآن"}</span>
            {!loading && <LogIn size={18} />}
          </button>
        </form>

        <div className={`${styles.footerSection} ${styles.animateFadeUp} ${styles.delay3}`}>
          <p className={styles.footerNote}>
            ليس لديك صلاحية دخول؟ تواصل مع مدير المؤسسة لإضافتك.
            <br />
            وصلتك دعوة على بريدك؟{" "}
            <Link href="/set-password" className={styles.inviteLink}>
              فعّل حسابك
            </Link>
          </p>
          <div className={styles.alertBox}>
            <div className={styles.alertText}>
              يتم منح الصلاحيات وإدارة الحسابات حصرياً من خلال مدير النظام.
            </div>
            <Info size={16} className={styles.alertIcon} />
          </div>
        </div>
      </div>
    </>
  );
}
