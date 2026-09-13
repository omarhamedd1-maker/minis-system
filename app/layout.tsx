import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

export const metadata: Metadata = {
  title: "Gridpoint",
  description: "نظام تشغيل للمتاجر",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // **ده اللي الآيفون بيكتبه تحت الإشعار** — اسم التطبيق زي ما هو متسجّل
    // على الشاشة الرئيسية. كان "Minis System" فكل إشعار بيجي وتحته السطر ده.
    // (وعلى أندرويد الاسم بيتاخد من `manifest.ts`، والاتنين بقوا بالعربي.)
    title: "Gridpoint",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f9fafb",
  // عشان الشريط السفلي في التليفون يفضل فوق شريط الهوم مش ملزوق تحت خالص
  viewportFit: "cover",
  // نثبّت الوضع الفاتح — عشان تليفون بالوضع الداكن مايفتحش بشاشة سودا
  colorScheme: "light",
  // نقفل الزوم على التليفون — يبقى إحساس تطبيق مش صفحة ويب
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas">{children}</body>
    </html>
  );
}
