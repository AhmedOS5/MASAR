import Link from "next/link";
import styles from "./Footer.module.css";
import { Globe, Mail, Share2, Send } from "lucide-react";
import Logo from "../Navbar/Logo";

export default function Footer() {
  return (
    <footer id="contact" className={styles.footerContainer}>
      {/* الجزء العلوي: القوائم والشعار */}
      <div className={styles.topSection}>
        {/* العمود 1: شعار ووصف مسار */}
        <div className={styles.brandColumn}>
          <div className={styles.logoWrapper}>
            <span className={styles.logoText}>مَسَار</span>
            <div className={styles.logoIcon}>{/* <Logo /> */}</div>
          </div>
          <p className={styles.brandDesc}>
            منصة ذكية لتنظيم العمل المؤسسي، إدارة البيانات، متابعة المهام،
            وتوليد التقارير داخل مساحة عمل آمنة.
          </p>
        </div>

        {/* العمود 2: المنصة */}
        <div className={styles.linksColumn}>
          <h3>المنصة</h3>
          <ul>
            <li>
              <Link href="#hero">الرئيسية</Link>
            </li>
            <li>
              <Link href="#how-it-works">كيف يعمل</Link>
            </li>
            <li>
              <Link href="#modules">الوحدات</Link>
            </li>
            <li>
              <Link href="#security">الأمان</Link>
            </li>
          </ul>
        </div>

        {/* العمود 3: الدعم */}
        <div className={styles.linksColumn}>
          <h3>الدعم والسياسات</h3>
          <ul>
            <li>
              <Link href="/contact">تواصل معنا</Link>
            </li>
            <li>
              <Link href="/faq">الأسئلة الشائعة</Link>
            </li>
            <li>
              <Link href="/privacy">سياسة الخصوصية</Link>
            </li>
            <li>
              <Link href="/terms">الشروط والأحكام</Link>
            </li>
          </ul>
        </div>

        {/* العمود 4: النشرة البريدية */}
        <div className={styles.newsletterColumn}>
          <h3>ابقى على اطلاع</h3>
          <p>اشترك في نشرتنا ليصلك كل جديد عن مسار.</p>
          <div className={styles.inputGroup}>
            <input type="email" placeholder="البريد الإلكتروني..." />
            <button aria-label="Subscribe">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      <hr className={styles.divider} />

      {/* الجزء السفلي: الحقوق والأيقونات */}
      <div className={styles.bottomSection}>
        {/* الأيقونات جهة اليسار */}
        <div className={styles.socialIcons}>
          <a href="#" aria-label="Share" className={styles.iconLink}>
            <Share2 size={18} />
          </a>
          <a
            href="mailto:info@masar.com"
            aria-label="Mail"
            className={styles.iconLink}
          >
            <Mail size={18} />
          </a>
          <a href="#" aria-label="Website" className={styles.iconLink}>
            <Globe size={18} />
          </a>
        </div>

        {/* الحقوق جهة اليمين */}
        <div className={styles.copyright}>
          &copy; {new Date().getFullYear()} مَسَار. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
  );
}
