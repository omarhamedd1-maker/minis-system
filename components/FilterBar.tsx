// ==========================================================================
// شريط الفلاتر — صف واحد لكل الصفحات (المرحلة ٢، الخطوة ٢)
// --------------------------------------------------------------------------
// الشكل: [🔍 بحث] [الفترة ▾] [فلاتر الصفحة ▾] [مسح]
// وتحته شرايح الفلاتر المفعّلة، كل واحدة عليها ✕.
//
// ⚠️ **البحث أول عنصر** — كان آخر صف في صفحة الأوردرات.
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
  basePath,
  query,
  search,
  chips = [],
  clearHref,
  children,
}: {
  basePath: string;
  /** باقي الفلاتر — بتتحط كـhidden في فورم البحث عشان ماتضيعش */
  query: Record<string, string | undefined>;
  search?: { name: string; value?: string; placeholder: string };
  chips?: FilterChip[];
  /** لينك «مسح» — بيبان لما يكون فيه فلتر شغّال */
  clearHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {search && (
          <form action={basePath} className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
            {Object.entries(query).map(([k, v]) =>
              v && k !== search.name ? (
                <input key={k} type="hidden" name={k} value={v} />
              ) : null
            )}
            <input
              name={search.name}
              defaultValue={search.value ?? ""}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              className="w-full min-w-0 flex-1 rounded-full border-0 bg-surface px-4 py-2 text-sm text-ink shadow-card placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              aria-label="بحث"
              title="بحث"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-dark"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 1 0 3.4 9.83l3.64 3.63a1 1 0 0 0 1.41-1.41l-3.63-3.64A5.5 5.5 0 0 0 9 3.5zM5.5 9a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </form>
        )}

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
