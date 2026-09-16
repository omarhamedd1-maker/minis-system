"use client";

// ==========================================================================
// منسدلة فلتر — بتنقلك أول ما تختار، وبتحافظ على باقي الفلاتر
// --------------------------------------------------------------------------
// ⚠️ **منسدلة مش شرايح** لما الاختيارات كتير (١٢ حالة · ١٣ نوع مصروف).
// الشرايح بتاخد ٤ صفوف على الموبايل، والمنسدلة سطر.
// ==========================================================================

import { useRouter } from "next/navigation";

export function FilterSelect({
  name,
  value,
  options,
  allLabel,
  basePath,
  query,
  resetKeys = [],
  label,
}: {
  /** اسم الباراميتر في اللينك */
  name: string;
  value?: string;
  /** كل اختيار يقدر يحط باراميترات خاصة بيه (زي الأرشيف) بدل name=value */
  options: { value: string; label: string; params?: Record<string, string> }[];
  /** نص «الكل» — القيمة الفاضية */
  allLabel: string;
  basePath: string;
  query: Record<string, string | undefined>;
  resetKeys?: string[];
  /** وصف للقارئ الآلي */
  label: string;
}) {
  const router = useRouter();

  const extraKeys = options.flatMap((o) => Object.keys(o.params ?? {}));

  function go(next: string) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (!v || k === name || resetKeys.includes(k) || extraKeys.includes(k)) continue;
      p.set(k, v);
    }
    const picked = options.find((o) => o.value === next);
    if (picked && picked.params) {
      for (const [k, v] of Object.entries(picked.params)) p.set(k, v);
    } else if (next) p.set(name, next);
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => go(e.target.value)}
      className="field w-auto min-w-32 py-1.5 text-xs"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
