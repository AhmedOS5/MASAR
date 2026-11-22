"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/ui/ErrorScreen";

/** Catches rendering errors of any public page (landing, login, register, verify-email …). */
export default function Error({ error, unstable_retry, reset }) {
  useEffect(() => {
    // Production errors from Server Components arrive without details; `digest` matches the server log entry.
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      title="حدث خطأ غير متوقع"
      message="تعذر عرض هذه الصفحة. يمكنك إعادة المحاولة، وإن استمرت المشكلة فتواصل مع فريق الدعم."
      digest={error?.digest}
      onRetry={unstable_retry ?? reset}
      actions={[{ href: "/", label: "العودة إلى الصفحة الرئيسية" }]}
    />
  );
}
