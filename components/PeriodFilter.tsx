"use client";

// ==========================================================================
// محدد الفترة — مكوّن واحد بشكلين (المرحلة ٢، الخطوة ١ + قرار ١٦ سبتمبر)
// --------------------------------------------------------------------------
//   • **الموبايل: منسدلة** — الشرايط الأفقية كانت بتتقص وتخبّي اختيارات.
//   • **الديسكتوب: شرايط** — المساحة موجودة، والاختيار بضغطة واحدة.
//
// الاتنين نفس المكوّن ونفس اللينكات، فمفيش صفحة بتختلف عن التانية.
//
// ⚠️ **الفلاتر التانية بتيجي من السيرفر في `query`** مش من `useSearchParams` —
// كده اللينكات بتتبني وقت الرندر، وكل صفحة بتقرر أنهي فلاتر تتصفّر (`resetKeys`).
// ==========================================================================

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_LABEL,
  PERIOD_PRESETS,
  periodHref,
  type PresetKey,
  type ResolvedPeriod,
} from "@/lib/periods";

export function PeriodFilter({
  basePath,
  query,
  current,
  defaultKey,
  allowAll = false,
  resetKeys = [],
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  current: ResolvedPeriod;
  defaultKey: PresetKey | "all";
  allowAll?: boolean;
  resetKeys?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isCustom = current.key === "custom";

  const options: { key: PresetKey | "all"; label: string }[] = [
    ...PERIOD_PRESETS,
    ...(allowAll || defaultKey === "all" ? [{ key: "all" as const, label: ALL_LABEL }] : []),
  ];

  const hrefFor = (key: PresetKey | "all") =>
    periodHref(basePath, query, { key }, defaultKey, resetKeys);

  function applyRange(nextFrom: string, nextTo: string) {
    const f = nextFrom || nextTo;
    const t = nextTo || nextFrom;
    if (!f) return;
    router.push(periodHref(basePath, query, { from: f, to: t }, defaultKey, resetKeys));
  }

  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
      active ? "bg-primary text-white" : "bg-surface text-ink-muted shadow-card hover:bg-sunken"
    }`;

  return (
    <div className="flex items-center gap-2">
      {/* الموبايل — منسدلة */}
      <select
        aria-label="الفترة"
        value={isCustom ? "custom" : current.key}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "custom") setOpen(true);
          else router.push(hrefFor(v as PresetKey | "all"));
        }}
        className="field w-auto py-1.5 text-xs sm:hidden"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
        <option value="custom">{isCustom ? current.label : "مدة مخصصة…"}</option>
      </select>

      {/* الديسكتوب — شرايط */}
      <div className="hidden items-center gap-2 sm:flex">
        {options.map((o) => (
          <Link
            key={o.key}
            href={hrefFor(o.key)}
            className={chip(current.key === o.key)}
            aria-current={current.key === o.key ? "true" : undefined}
          >
            {o.label}
          </Link>
        ))}
      </div>

      {/* التقويم — مشترك بين الشكلين */}
      <span className="relative inline-flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="اختار يوم أو مدة"
          aria-label="اختار يوم أو مدة من التقويم"
          className={`${chip(isCustom)} inline-flex h-11 items-center gap-1.5 sm:h-auto`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zm10 6H4v8h12V8z"
              clipRule="evenodd"
            />
          </svg>
          <span className="hidden sm:inline">{isCustom ? current.label : "مدة مخصصة"}</span>
        </button>

        {isCustom && (
          <Link
            href={periodHref(basePath, query, { clear: true }, defaultKey, resetKeys)}
            title="إلغاء المدة المخصصة"
            aria-label="إلغاء المدة المخصصة"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-xs text-ink-muted shadow-card hover:bg-sunken sm:h-auto sm:w-auto sm:px-2 sm:py-1"
          >
            ✕
          </Link>
        )}

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true"></div>
            <div className="fixed inset-x-4 top-24 z-50 flex flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-pop sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:w-max ltr:left-0 rtl:left-0">
              <label className="flex items-center justify-between gap-3 text-xs text-ink-muted">
                <span>من</span>
                <input
                  type="date"
                  defaultValue={current.from ?? ""}
                  onChange={(e) => applyRange(e.target.value, current.to ?? "")}
                  className="field w-auto px-2 py-1"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs text-ink-muted">
                <span>إلى</span>
                <input
                  type="date"
                  defaultValue={current.to ?? ""}
                  onChange={(e) => applyRange(current.from ?? "", e.target.value)}
                  className="field w-auto px-2 py-1"
                />
              </label>
              <p className="text-[11px] text-ink-faint">سيب «إلى» فاضية عشان يوم واحد بس</p>
            </div>
          </>
        )}
      </span>
    </div>
  );
}
