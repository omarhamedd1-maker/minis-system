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
  title: "Minis System",
  description: "نظام إدارة تشغيل Minis",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Minis System",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#efeeec",
  // عشان الشريط السفلي في التليفون يفضل فوق شريط الهوم مش ملزوق تحت خالص
  viewportFit: "cover",
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
