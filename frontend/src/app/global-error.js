"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/ui/ErrorScreen";

/** Last resort: an error in the root layout / providers themselves. Replaces the layout, so it brings its own <html>. */
export default function GlobalError({ error, unstable_retry, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0 }}>
        <title>خطأ | MASAR</title>
        <ErrorScreen
          title="حدث خطأ غير متوقع"
          message="تعذر تحميل المنصة. حاول مجدداً بعد لحظات، وإن استمرت المشكلة فتواصل مع فريق الدعم."
          digest={error?.digest}
          onRetry={unstable_retry ?? reset}
          actions={[{ href: "/", label: "العودة إلى الصفحة الرئيسية" }]}
        />
      </body>
    </html>
  );
}
