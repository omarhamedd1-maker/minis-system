// ==========================================================================
// شريط الفلاتر — صف واحد لكل الصفحات (المرحلة ٢، الخطوة ٢)
// --------------------------------------------------------------------------
// الشكل: [الفترة ▾] [فلاتر الصفحة ▾] [مسح]
// وتحته شرايح الفلاتر المفعّلة، كل واحدة عليها ✕.
//
// ⚠️ **مفيش بحث هنا** — البحث أيقونة واحدة في الهيدر بتبحث في الصفحة
// (components/HeaderSearch.tsx · قرار عمر ١٧ سبتمبر). البحث الشغّال بيبان
// كشريحة تحت.
// ⚠️ **الفلتر المفعّل لازم يبان** (قاعدة ٨ في DESIGN.md) — الصفحة ماتفضلش
// مفلترة وساكتة عن السبب.
// ==========================================================================

import Link from "next/link";

export type FilterChip = {
  label: string;
  /** لينك بيشيل الفلتر ده بس */
  removeHref: string;
};

export function FilterBar({
  chips = [],
  clearHref,
  children,
}: {
  chips?: FilterChip[];
  /** لينك «مسح» — بيبان لما يكون فيه فلتر شغّال */
  clearHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {children}

        {clearHref && (
          <Link
            href={clearHref}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-ink-muted underline-offset-4 hover:underline"
          >
            مسح
          </Link>
        )}
      </div>

      {chips.length > 0 && (
        <div className="-mx-1 flex flex-wrap items-center gap-2 px-1">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={c.removeHref}
              title={`شيل الفلتر: ${c.label}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-ink-body hover:bg-line"
            >
              {c.label}
              <span aria-hidden="true">✕</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
