import type { Metadata, Viewport } from "next";
import { Cairo, Lexend } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  // بدون خط احتياطي تلقائي — عشان الحروف العربية تعدّي لخط كايرو
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "مينيز",
  description: "نظام إدارة تشغيل مينيز",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // **ده اللي الآيفون بيكتبه تحت الإشعار** — اسم التطبيق زي ما هو متسجّل
    // على الشاشة الرئيسية. كان "Minis System" فكل إشعار بيجي وتحته السطر ده.
    // (وعلى أندرويد الاسم بيتاخد من `manifest.ts`، والاتنين بقوا بالعربي.)
    title: "مينيز",
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
      className={`${cairo.variable} ${lexend.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50">{children}</body>
    </html>
  );
}
