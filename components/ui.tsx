// ==========================================================================
// مكوّنات الشكل الموحدة — الزرار والكارت والبادج وهيدر الصفحة
// --------------------------------------------------------------------------
// قبل الملف ده كل صفحة كانت بتكتب أزرارها بإيدها — طلع ١٢+ شكل مختلف
// لنفس الزرار. هنا الشكل واحد: بتغيره من مكان واحد بيتعدل في كل حاجة.
//
// الألوان جاية من توكنز `globals.css` (`--color-primary` ودرجاته) —
// اللون الأساسي اختاره عمر، وتغييره بيتم من التوكنز مش من الملفات.
// ==========================================================================

import type { ReactNode } from "react";

/** الكارت الأساسي — نفس اللي كان متكتب بإيد في كل صفحة، بقى مكوّن */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

/**
 * هيدر الصفحة الموحد — العنوان والوصف وإجراء رئيسي على الشمال.
 * قبل كده كل صفحة كانت بتعمل شكل مختلف للعنوان.
 */
export function PageHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {desc && <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/** أنماط الزرار الموحدة — بدل النسخ واللصق. للاستخدام مع `<button>` */
export const btn = {
  /** الإجراء الرئيسي — بلون البراند */
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50",
  /** إجراء ثانوي — بحدود وخلفية بيضا */
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50",
  /** زرار هادي للإجراءات الصغيرة */
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50",
  /** إجراء خطر — مسح وإلغاء */
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50",
};

/** خانة إدخال موحدة — بنفس شكل اللي كان متكرر في الإعدادات */
export const input =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const BADGE_TONES = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-800",
  blue: "bg-blue-50 text-blue-700",
  brand: "bg-primary-soft text-primary",
} as const;

/** البادج الموحد — شرائح الحالات والعلامات الصغيرة */
export function Badge({
  children,
  tone = "gray",
  className = "",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** حالة «مافيش حاجة» الموحدة — بدل الفقرات المكتوبة بشكل مختلف */
export function EmptyState({
  title,
  desc,
}: {
  title: string;
  desc?: string | null;
}) {
  return (
    <Card className="py-8 text-center">
      <p className="text-sm text-gray-500">{title}</p>
      {desc && <p className="mt-1 text-xs text-gray-400">{desc}</p>}
    </Card>
  );
}
