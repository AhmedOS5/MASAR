import Link from "next/link";

export const metadata = { title: "سياسة الخصوصية | MASAR" };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px", lineHeight: 1.9 }}>
      <h1>سياسة الخصوصية</h1>
      <p>
        سيتم نشر النص النهائي لسياسة الخصوصية من قِبل إدارة منصة مَسَار. للاستفسار قبل التسجيل يرجى التواصل مع
        فريق المنصة.
      </p>
      <Link href="/register">العودة إلى التسجيل</Link>
    </main>
  );
}
