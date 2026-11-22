"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/ui/ErrorScreen";

/** A crash inside one dashboard screen: the header and sidebar (layout) stay usable, only the content is replaced. */
export default function DashboardError({ error, unstable_retry, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      inline
      title="تعذر عرض هذه الشاشة"
      message="حدث خطأ أثناء تحميل المحتوى. أعد المحاولة أو انتقل إلى شاشة أخرى من القائمة الجانبية."
      digest={error?.digest}
      onRetry={unstable_retry ?? reset}
      actions={[{ href: "/dashboard", label: "لوحة التحكم" }]}
    />
  );
}
