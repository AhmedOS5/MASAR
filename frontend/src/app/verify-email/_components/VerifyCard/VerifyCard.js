import React from "react";
import Link from "next/link";
import { Mail, RotateCcw, Info, Lock, ArrowRight, CheckCircle, AlertTriangle, KeyRound } from "lucide-react";
import styles from "./VerifyCard.module.css"; // استيراد الستايل الخاص بالبطاقة فقط

export default function VerifyCard({
  email,
  code,
  codeLength = 6,
  onCodeChange,
  timer,
  isLoading,
  isVerifying,
  locked,
  onResend,
  onVerify,
  error,
  message,
  verifyError,
}) {
  // دالة لتسهيل الـ UX وفتح موقع البريد تلقائياً عند الضغط
  const handleOpenEmailProvider = () => {
    const domain = email?.split("@")[1];
    const valid = domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
    window.open(
      valid ? `https://${domain}` : "https://mail.google.com",
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onVerify();
  };

  const complete = code.length === codeLength;

  return (
    <div className={styles.cardContainer}>
      {/* العناوين الداخلية للبطاقة */}
      <h2 className={styles.cardTitle}>تحقق من بريد المؤسسة</h2>
      <p className={styles.cardSubTitle}>
        أرسلنا رمز تحقق مكوّناً من {codeLength} أرقام إلى بريد المؤسسة. أدخله
        أدناه لإكمال إنشاء مساحة العمل.
      </p>

      {/* صندوق التنبيه البنفسجي اللطيف */}
      <div className={styles.alertBox}>
        تم إنشاء مساحة عمل مؤسستك مبدئياً. الرمز صالح لمدة 15 دقيقة، ولا تشاركه
        مع أي شخص.
      </div>

      {/* رسائل الخطأ أو النجاح الخاصة بالـ API */}
      {error && <div className={styles.errorText} role="alert">⚠️ {error}</div>}
      {message && <div className={styles.successText} role="status">✅ {message}</div>}

      {/* رسالة خطأ الرمز - تظهر بالأحمر عند إدخال رمز غير صحيح */}
      {verifyError && (
        <div className={styles.verifyErrorBox} role="alert">
          <AlertTriangle size={18} className={styles.verifyErrorIcon} />
          <p className={styles.verifyErrorText}>{verifyError}</p>
        </div>
      )}

      {/* حقل البريد الإلكتروني المقفول (Disabled) */}
      <div className={styles.inputGroup}>
        <label className={styles.inputLabel}>البريد الإلكتروني المسجل</label>
        <div className={styles.inputWrapper}>
          <input
            type="email"
            value={email}
            placeholder="—"
            disabled
            className={styles.disabledInput}
            aria-label="البريد الإلكتروني المسجل"
          />
          <Lock className={styles.fieldIcon} size={16} />
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* حقل رمز التحقق */}
        <div className={styles.inputGroup}>
          <label htmlFor="verification-code" className={styles.inputLabel}>
            رمز التحقق ({codeLength} أرقام)
          </label>
          <div className={styles.inputWrapper}>
            <input
              id="verification-code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={codeLength + 2}
              dir="ltr"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="······"
              disabled={isVerifying || locked}
              className={styles.codeInput}
              aria-invalid={Boolean(verifyError)}
              aria-describedby="verification-code-hint"
              autoFocus
            />
            <KeyRound className={styles.fieldIcon} size={16} />
          </div>
          <p id="verification-code-hint" className={styles.codeHint}>
            {locked
              ? "تجاوزت عدد المحاولات المسموح بها. اطلب رمزاً جديداً."
              : "لديك 5 محاولات لكل رمز. إذا لم يصلك الرمز فتحقق من البريد غير الهام."}
          </p>
        </div>

        {/* التنبيه الأزرق لمعلومات الدخول */}
        <div className={styles.infoBox}>
          <Info size={18} className={styles.infoIcon} />
          <p className={styles.infoText}>
            لن تتمكن من الوصول إلى لوحة التحكم أو استكمال إعداد مساحة العمل قبل
            تفعيل البريد الإلكتروني.
          </p>
        </div>

        {/* منطقة أزرار التحكم والعمليات */}
        <div className={styles.actionArea}>
          <button
            type="submit"
            disabled={isVerifying || !complete || locked}
            className={styles.verifyBtn}
          >
            <CheckCircle size={18} />
            <span>{isVerifying ? "جاري التحقق..." : "تأكيد الرمز"}</span>
          </button>

          {/* فتح البريد الإلكتروني */}
          <button type="button" onClick={handleOpenEmailProvider} className={styles.primaryBtn}>
            <Mail size={18} />
            <span>فتح البريد الإلكتروني</span>
          </button>

          {/* إعادة الإرسال المحكومة بالعداد التنازلي والـ API */}
          <button
            type="button"
            onClick={onResend}
            disabled={timer > 0 || isLoading}
            className={styles.secondaryBtn}
          >
            <RotateCcw size={16} />
            <span>{isLoading ? "جاري الإرسال..." : "إعادة إرسال الرمز"}</span>
            {timer > 0 && (
              <span className={styles.timerText}>
                {String(Math.floor(timer / 60)).padStart(2, "0")}:{String(timer % 60).padStart(2, "0")}
              </span>
            )}
          </button>
        </div>
      </form>

      {/* رابط العودة للتسجيل في الأسفل */}
      <div className={styles.backToLoginWrapper}>
        <Link href="/register" className={styles.backToLoginLink}>
          <ArrowRight size={16} />
          <span>العودة إلى التسجيل</span>
        </Link>
      </div>
    </div>
  );
}
