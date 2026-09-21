"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ==========================================================================
 * التحميل التلقائي عند النزول (ORDERS-PAGE-REDESIGN §٥ · الخطوة ٩)
 * --------------------------------------------------------------------------
 * بدل ما تدوس «عرض المزيد» كل ٥٠ أوردر، الصفحة بتجيب اللي بعدهم وانت نازل.
 *
 * ⚠️ **اللينك بيفضل موجود مش بيختفي** — لو الجافاسكريبت مااشتغلش أو المراقب
 * مافتحش، الدوسة اليدوية لسه شغالة. الميزة إضافة مش بديل.
 *
 * ⚠️ **`replace` مش `push`** — الرجوع بالمتصفح لازم يرجّعك للصفحة اللي كنت
 * فيها، مش يعدّي على ٥٠ و١٠٠ و١٥٠ واحدة واحدة.
 *
 * ⚠️ **ومافيش نداء مكرر لنفس اللينك**: المراقب بيرنّ كذا مرة وانت بتنزل،
 * فبنقفل على آخر لينك اتنادى.
 * ==========================================================================
 */
export function AutoLoadMore({
  href,
  label,
}: {
  href: string;
  /** نص اللينك اليدوي — نفس اللي كان في «عرض المزيد» */
  label: string;
}) {
  const router = useRouter();
  const sentinel = useRef<HTMLDivElement>(null);
  const fired = useRef<string | null>(null);
  // ⚠️ **اللينك اللي بيتحمّل، مش «بيحمّل نعم/لأ»** — أول ما اللينك يتغير
  // (يعني الدفعة وصلت) الحالة بترجع لوحدها، من غير تصفير جوّه الـeffect
  const [loadingHref, setLoadingHref] = useState<string | null>(null);
  const loading = loadingHref === href;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (fired.current === href) return;
        fired.current = href;
        setLoadingHref(href);
        router.replace(href, { scroll: false });
      },
      // بنبدأ نجيب قبل ما توصل لآخر القايمة — عشان مايبقاش فيه وقفة
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [href, router]);

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
      {loading ? (
        <span className="text-xs text-ink-muted">بيجيب الباقي…</span>
      ) : (
        <Link
          scroll={false}
          href={href}
          className="rounded-control bg-surface px-6 py-2 text-sm font-medium text-ink-body shadow-card hover:bg-sunken"
        >
          {label}
        </Link>
      )}
    </div>
  );
}
