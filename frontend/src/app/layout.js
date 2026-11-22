import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

// The one typeface of the product: IBM Plex Sans Arabic (Arabic + matching Latin letters and digits).
// To try another family, swap the import and this call (e.g. Tajawal, Almarai, Readex_Pro) — nothing else changes.
const appFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "منصة مسار | MASAR",
  description: "مساحة عمل رقمية متكاملة لإدارة العمليات والمؤسسات",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    // data-app-theme is set by the boot script before first paint, so React must not treat it as a mismatch.
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={appFont.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
