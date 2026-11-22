"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./register.module.css";
import { useRouter } from "next/navigation";
import { registerOrganization } from "@/services/auth.service";
import { useToast } from "@/components/Toast/ToastProvider";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";

const FIELD_MAP = {
  organization_name: "organizationName",
  organization_email: "organizationEmail",
  admin_email: "personalEmail",
  region: "region",
  phone: "phone",
  admin_password: "password",
  admin_password_confirmation: "confirmPassword",
  organization_region: "region",
  organization_phone: "phone",
  organization_type: "organizationType",
  agreed_to_terms: "agreedToTerms",
};

const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "mail.com",
  "yandex.com",
  "protonmail.com",
  "zoho.com",
  "gmx.com",
  "msn.com",
  "me.com",
  "mac.com",
  "proton.me",
  "ymail.com",
  "yahoo.co.uk",
  "hotmail.co.uk",
];

const EMPTY_FORM = {
  organizationName: "",
  organizationEmail: "",
  region: "",
  phone: "",
  password: "",
  confirmPassword: "",
  personalEmail: "",
  organizationType: "ngo",
  agreedToTerms: false,
};

const FieldError = ({ fieldErrors, fieldName }) => {
  if (!fieldErrors[fieldName]) return null;
  return (
    <div className={styles.fieldError}>
      <AlertTriangle size={13} />
      <span>{fieldErrors[fieldName]}</span>
    </div>
  );
};

export default function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // The first render (server AND client) always starts from the empty defaults so the markup matches during hydration;
  // the saved draft is restored right after mount.
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasRegistered, setHasRegistered] = useState(false);

  useEffect(() => {
    try {
      const savedData = sessionStorage.getItem("registerFormData");
      if (savedData) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormData({
          ...EMPTY_FORM,
          ...JSON.parse(savedData),
          password: "",
          confirmPassword: "",
          organizationType: "ngo",
        });
      }
      setHasRegistered(sessionStorage.getItem("registrationCompleted") === "true");
    } catch {
      // storage unavailable or a corrupt draft: keep the empty defaults
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      // Never persist secrets: password fields are stripped before storing.
      const { password, confirmPassword, ...safeData } = formData;
      sessionStorage.setItem("registerFormData", JSON.stringify(safeData));
    }
  }, [formData, isLoaded]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const isLengthValid = formData.password.length >= 8;
  const hasNumber = /[0-9]/.test(formData.password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_]/.test(formData.password);

  const clearErrors = () => {
    setGeneralError("");
    setFieldErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearErrors();

    const localErrors = {};

    if (!formData.organizationName.trim()) {
      localErrors.organizationName = "اسم المؤسسة مطلوب";
    }

    if (!formData.phone.trim()) {
      localErrors.phone = "رقم الجوال مطلوب";
    } else if (formData.phone.trim().length < 8) {
      localErrors.phone = "يرجى إدخال رقم جوال صالح";
    }

    if (!formData.organizationEmail.trim()) {
      localErrors.organizationEmail = "البريد الإلكتروني للمؤسسة مطلوب";
    } else {
      const emailDomain = formData.organizationEmail
        .split("@")[1]
        ?.toLowerCase();
      if (FREE_EMAIL_DOMAINS.includes(emailDomain)) {
        localErrors.organizationEmail =
          "يرجى استخدام بريد مؤسسة رسمي (غير مسموح ببريد مجاني  Gmail/Yahoo)";
      }
    }

    // لا تحقق إضافي هنا — تركنا التحقق للسيرفر

    if (!formData.personalEmail.trim()) {
      localErrors.personalEmail = "البريد الإلكتروني الشخصي مطلوب";
    }
    if (!formData.password) {
      localErrors.password = "كلمة المرور مطلوبة";
    } else if (formData.password.length < 8) {
      localErrors.password = "كلمة المرور يجب أن تكون 8 أحرف على الأقل";
    }
    if (formData.password !== formData.confirmPassword) {
      localErrors.confirmPassword = "كلمات المرور غير متطابقة";
    }
    if (!formData.agreedToTerms) {
      localErrors.agreedToTerms = "يجب الموافقة على الشروط والأحكام للاستمرار";
    }

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setGeneralError(
        `يوجد ${Object.keys(localErrors).length} ${Object.keys(localErrors).length === 1 ? "خطأ" : "أخطاء"} في النموذج، يرجى تصحيحها.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsLoading(true);

    const payload = {
      organization_name: formData.organizationName,
      organization_email: formData.organizationEmail,
      admin_email: formData.personalEmail,
      organization_region: formData.region,
      organization_phone: formData.phone,
      admin_password: formData.password,
      admin_password_confirmation: formData.confirmPassword,
      organization_type: formData.organizationType,
      agreed_to_terms: formData.agreedToTerms,
    };

    try {
      await registerOrganization(payload);
      sessionStorage.setItem("registrationCompleted", "true");

      // The backend e-mails a 6-digit verification code (it is never returned to the browser). Ownership of the
      // address is proven by typing that code on the next screen.

      router.push(
        `/verify-email?email=${encodeURIComponent(formData.personalEmail)}`,
      );
    } catch (err) {
      applyBackendErrors(err);
    } finally {
      setIsLoading(false);
    }
  };

  const applyBackendErrors = (err) => {
    const mapped = {};
    for (const [backendKey, msg] of Object.entries(err.fieldErrors || {})) {
      const frontKey = FIELD_MAP[backendKey];
      if (frontKey) mapped[frontKey] = msg;
    }

    if (Object.keys(mapped).length > 0) {
      setFieldErrors(mapped);
      const n = Object.keys(mapped).length;
      setGeneralError(
        `يوجد ${n} ${n === 1 ? "خطأ" : "أخطاء"} في النموذج، يرجى تصحيحها.`,
      );
    } else {
      setGeneralError(err.message || "تعذر الاتصال بالسيرفر، حاول لاحقاً.");
    }
    toast.error("تعذر إنشاء مساحة العمل. راجع الأخطاء في النموذج.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className={styles.formSection}>
      <form className={styles.workspaceForm} onSubmit={handleSubmit}>
        {generalError && (
          <div className={styles.errorBanner}>
            <div className={styles.errorBannerContent}>
              <div className={styles.errorBannerIcon}>
                <AlertTriangle size={20} />
              </div>
              <div className={styles.errorBannerText}>
                <p className={styles.errorBannerTitle}>تنبيه</p>
                <p className={styles.errorBannerMessage}>{generalError}</p>
              </div>
            </div>
            <button
              type="button"
              className={styles.errorBannerClose}
              onClick={clearErrors}
              aria-label="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label>اسم المؤسسة</label>
            <div
              className={`${styles.inputWrapper} ${fieldErrors.organizationName ? styles.inputError : ""}`}
            >
              <input
                type="text"
                name="organizationName"
                value={formData.organizationName}
                onChange={handleChange}
                placeholder="مثال: مؤسسة الأمل"
              />
              <Building2 className={styles.fieldIcon} size={18} />
            </div>
            <FieldError
              fieldErrors={fieldErrors}
              fieldName="organizationName"
            />
          </div>
          <div className={styles.inputGroup}>
            <label>البريد الإلكتروني للمؤسسة</label>
            <div
              className={`${styles.inputWrapper} ${fieldErrors.organizationEmail ? styles.inputError : ""}`}
            >
              <input
                type="email"
                name="organizationEmail"
                value={formData.organizationEmail}
                onChange={handleChange}
                autoComplete="off"
                placeholder="contact@organization.org"
              />
              <Mail className={styles.fieldIcon} size={18} />
            </div>
            <FieldError
              fieldErrors={fieldErrors}
              fieldName="organizationEmail"
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label>المنطقة</label>
            <div
              className={`${styles.inputWrapper} ${fieldErrors.region ? styles.inputError : ""}`}
            >
              <select
                name="region"
                value={formData.region}
                onChange={handleChange}
              >
                <option value="" disabled>
                  اختر المنطقة
                </option>
                <option value="gaza">غزة</option>
                <option value="westbank">الضفة الغربية</option>
                <option value="jerusalem">القدس</option>
              </select>
              <MapPin className={styles.fieldIcon} size={18} />
            </div>
            <FieldError fieldErrors={fieldErrors} fieldName="region" />
          </div>
          <div className={styles.inputGroup}>
            <label>رقم الجوال</label>
            <div
              className={`${styles.inputWrapper} ${fieldErrors.phone ? styles.inputError : ""}`}
            >
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+970 5X XXX XXXX"
                style={{ direction: "ltr", textAlign: "right" }}
              />
              <Phone className={styles.fieldIcon} size={18} />
            </div>
            <FieldError fieldErrors={fieldErrors} fieldName="phone" />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label>كلمة المرور</label>
            <div
              className={`${styles.inputWrapper} ${fieldErrors.password ? styles.inputError : ""}`}
            >
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                placeholder="ادخل كلمة المرور"
              />
              <Lock className={styles.fieldIcon} size={18} />
              <button
                type="button"
                className={styles.toggleVisibility}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <FieldError fieldErrors={fieldErrors} fieldName="password" />
          </div>
          <div className={styles.inputGroup}>
            <label>تأكيد كلمة المرور</label>
            <div
              className={`${styles.inputWrapper} ${fieldErrors.confirmPassword ? styles.inputError : ""}`}
            >
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                placeholder="أعد إدخال كلمة المرور"
              />
              <Lock className={styles.fieldIcon} size={18} />
              <button
                type="button"
                className={styles.toggleVisibility}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <FieldError fieldErrors={fieldErrors} fieldName="confirmPassword" />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.inputGroup}>
            <label>البريد الإلكتروني الشخصي</label>
            <div
              className={`${styles.inputWrapper} ${fieldErrors.personalEmail ? styles.inputError : ""}`}
            >
              <input
                type="email"
                name="personalEmail"
                value={formData.personalEmail}
                onChange={handleChange}
                autoComplete="off"
                placeholder="person@gmail.com"
              />
              <Mail className={styles.fieldIcon} size={18} />
            </div>
            <FieldError fieldErrors={fieldErrors} fieldName="personalEmail" />
          </div>
          <div className={styles.inputGroup}>
            <label>نوع المنظمة</label>
            <div
              className={`${styles.inputWrapper} ${fieldErrors.organizationType ? styles.inputError : ""}`}
            >
              <input
                type="hidden"
                name="organizationType"
                value={formData.organizationType}
              />
              <select
                name="organizationType"
                value={formData.organizationType}
                disabled
              >
                <option value="ngo">منظمة غير حكومية (NGO)</option>
                <option value="company">شركة خاصة</option>
                <option value="gov">مؤسسة حكومية</option>
              </select>
              <MapPin className={styles.fieldIcon} size={18} />
            </div>
            <FieldError
              fieldErrors={fieldErrors}
              fieldName="organizationType"
            />
          </div>
        </div>

        <div className={styles.passwordRequirements}>
          <p className={styles.reqTitle}>متطلبات كلمة المرور:</p>
          <div className={styles.reqList}>
            <span
              className={`${styles.reqItem} ${isLengthValid ? styles.valid : ""}`}
            >
              {isLengthValid ? "✓" : "○"} 8 أحرف على الأقل
            </span>
            <span
              className={`${styles.reqItem} ${hasNumber ? styles.valid : ""}`}
            >
              {hasNumber ? "✓" : "○"} رقم واحد على الأقل
            </span>
            <span
              className={`${styles.reqItem} ${hasSpecialChar ? styles.valid : ""}`}
            >
              {hasSpecialChar ? "✓" : "○"} حرف/رمز خاص
            </span>
          </div>
        </div>

        <div
          className={`${styles.termsAgreement} ${fieldErrors.agreedToTerms ? styles.termsError : ""}`}
        >
          <input
            type="checkbox"
            id="terms"
            name="agreedToTerms"
            checked={formData.agreedToTerms}
            onChange={handleChange}
            className={styles.checkboxInput}
          />
          <label htmlFor="terms">
            أوافق على <Link href="/terms">الشروط والأحكام</Link> و{" "}
            <Link href="/privacy">سياسة الخصوصية</Link>.
          </label>
        </div>
        <FieldError fieldErrors={fieldErrors} fieldName="agreedToTerms" />

        <div className={styles.submitContainer}>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            <span>
              {isLoading ? "جاري إنشاء مساحة العمل..." : "إنشاء مساحة العمل"}
            </span>
            {isLoading ? (
              <Loader2 size={18} className={styles.spinnerIcon} />
            ) : (
              <ArrowLeft size={18} />
            )}
          </button>

          {hasRegistered && formData.personalEmail && isLoaded && (
            <Link
              href={`/verify-email?email=${encodeURIComponent(
                formData.personalEmail,
              )}`}
              className={styles.backToVerifyLink}
            >
              <ArrowRight size={18} />
              <span>العودة لصفحة التفعيل</span>
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}
