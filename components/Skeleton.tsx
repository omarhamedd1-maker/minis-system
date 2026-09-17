/**
 * ==========================================================================
 * كروت هيكلية — شكل الصفحة وهي بتحمّل (DESIGN §٢ قاعدة ٣)
 * --------------------------------------------------------------------------
 * الصفحة اللي بتفضل بيضا وبعدين تقفز فجأة بتحسّ إنها وقعت. الهيكل بيحجز
 * المكان بنفس المقاسات، فالمحتوى بيحل محله من غير قفزة.
 *
 * ⚠️ **مكوّن واحد لكل السيستم** — أي صفحة عندها `loading.tsx` بتستخدمه.
 * لو كل صفحة رسمت هيكلها، كل واحدة كانت هتختلف عن التانية وعن نفسها بعد
 * أول تعديل.
 *
 * ⚠️ **المقاسات لازم تطابق الحقيقي** — كارت الأوردر ١٥٣px، وصف الجدول
 * ٤٥px. الهيكل اللي مقاسه غلط بيقفز برضه، بس بعد ما تشوفه.
 *
 * **مافيش نص جوّه** — قارئ الشاشة بيتقاله «بيحمّل» مرة واحدة بس
 * (`aria-busy` على الحاوية)، والباقي مخفي عنه.
 * ==========================================================================
 */

/** مستطيل رمادي بينبض */
export function SkeletonBox({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-sunken ${className}`} />;
}

/** كارت في قايمة الموبايل — نفس ارتفاع كارت الأوردر */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-card bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <SkeletonBox className="h-4 w-32" />
        <SkeletonBox className="h-8 w-24 rounded-full" />
      </div>
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBox key={i} className={`h-3 ${i === 0 ? "w-2/3" : "w-1/2"}`} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
        <SkeletonBox className="h-7 w-7 rounded-full" />
        <SkeletonBox className="h-7 w-7 rounded-full" />
        <SkeletonBox className="ms-auto h-3 w-10" />
      </div>
    </div>
  );
}

/** صف في جدول الديسكتوب */
export function SkeletonRow({ cols = 6 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonBox key={i} className={`h-3 ${i === 1 ? "flex-1" : "w-16"}`} />
      ))}
    </div>
  );
}

/**
 * قايمة كاملة: كروت على الموبايل وجدول على الديسكتوب — زي كل قوايم
 * السيستم.
 */
export function SkeletonList({
  rows = 6,
  cols = 6,
  lines = 3,
}: {
  rows?: number;
  cols?: number;
  lines?: number;
}) {
  return (
    <div aria-busy="true" aria-label="بيحمّل">
      <div className="space-y-2 md:hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonCard key={i} lines={lines} />
        ))}
      </div>
      <div className="hidden rounded-card bg-surface md:block">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} cols={cols} />
        ))}
      </div>
    </div>
  );
}

/** ترويسة الصفحة: العنوان والرقم الأساسي وشريط الفلاتر */
export function SkeletonHeader({ filters = 2 }: { filters?: number }) {
  return (
    <div aria-busy="true" aria-label="بيحمّل" className="mb-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBox className="h-6 w-28" />
        <SkeletonBox className="h-9 w-24" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: filters }).map((_, i) => (
          <SkeletonBox key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
    </div>
  );
}
