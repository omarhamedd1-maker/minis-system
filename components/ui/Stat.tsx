// ==========================================================================
// العناصر الموحّدة — الكارت والرقم
// --------------------------------------------------------------------------
// السيستم كان فيه ٤٨ كومبوننت ومفيش عنصر مشترك واحد، فكل شاشة بتخترع
// كارتها ومقاسها ولونها. النتيجة إن الداشبورد لوحدها كان فيها **أربع
// إيقاعات أعمدة مختلفة** في شاشة واحدة.
//
// الملف ده بيحط تلات قواعد وبس، واللي بعده يمشي عليها:
//
//   ١. **الشبكة ١٢ عمود، والعرض من قايمة مقفولة.** مفيش `col-span` بيتكتب
//      بالمزاج — العنصر بيقول `span={4}` والصف بيقفل لوحده.
//   ٢. **اللون معناه اتجاه الفلوس، مش زينة.** أخضر = داخل، أحمر = خارج،
//      رمادي = عدد أو حقيقة. النِّسَب رمادية إلا لو عدّت حد يستاهل انتباه.
//   ٣. **تلات مقاسات للرقم وبس**: `hero` للي بتبص عليه الأول، `base`
//      للعادي، `sm` للمساعد. مافيش مقاس رابع.
// ==========================================================================

import type { ReactNode } from "react";

/** الأعرضة المسموحة — بتقسم الـ١٢ بالظبط فالصف مايكسرش */
export type Span = 3 | 4 | 6 | 12;

/**
 * ⚠️ **لازم تفضل نصوص كاملة.** تايلويند بيقرا الكلاسات وقت البناء، فأي
 * كلاس متبني بالجمع (`col-span-${n}`) بيتشال من الملف النهائي.
 */
const SPAN: Record<Span, string> = {
  3: "col-span-1 sm:col-span-3",
  4: "col-span-2 sm:col-span-4",
  6: "col-span-2 sm:col-span-6",
  12: "col-span-2 sm:col-span-12",
};

export type Tone = "ink" | "in" | "out" | "warn";

const TONE: Record<Tone, string> = {
  ink: "text-gray-900",
  in: "text-emerald-600",
  out: "text-red-600",
  warn: "text-amber-600",
};

const SIZE = {
  hero: "text-3xl sm:text-4xl",
  base: "text-xl sm:text-2xl",
  sm: "text-base sm:text-lg",
} as const;

/** الشبكة اللي كل الكروت بتقعد جواها */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-12 sm:gap-4">
      {children}
    </div>
  );
}

/** سطح أبيض موحّد — أي محتوى مش رقم بيتحط جواه */
export function Card({
  span = 12,
  className = "",
  children,
}: {
  span?: Span;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 ${SPAN[span]} ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  hint,
  span = 3,
  tone = "ink",
  size = "base",
  children,
}: {
  label: string;
  hint?: string;
  span?: Span;
  tone?: Tone;
  size?: keyof typeof SIZE;
  children: ReactNode;
}) {
  return (
    <Card span={span} className="flex flex-col justify-between">
      <p className="text-xs text-gray-500 sm:text-sm">{label}</p>
      <p className={`mt-2 font-bold tabular-nums ${SIZE[size]} ${TONE[tone]}`}>
        {children}
      </p>
      {/* السطر المساعد بيتحجز مكانه حتى لو فاضي — عشان الكروت في الصف
          تفضل بنفس الطول ومايبقاش فيه سِنّ ناقصة */}
      <p className="mt-1 min-h-4 text-[11px] leading-4 text-gray-400 sm:text-xs">
        {hint ?? ""}
      </p>
    </Card>
  );
}
