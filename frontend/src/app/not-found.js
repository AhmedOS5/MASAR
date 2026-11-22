import ErrorScreen from "@/components/ui/ErrorScreen";

export const metadata = { title: "الصفحة غير موجودة | MASAR" };

export default function NotFound() {
  return (
    <ErrorScreen
      kind="notFound"
      title="الصفحة غير موجودة"
      message="الرابط الذي فتحته غير صحيح أو أن الصفحة نُقلت أو حُذفت."
      actions={[
        { href: "/", label: "الصفحة الرئيسية" },
        { href: "/dashboard", label: "لوحة التحكم" },
      ]}
    />
  );
}
