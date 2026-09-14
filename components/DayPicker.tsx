"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DayPicker({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = !!(from || to);

  function apply(nextFrom: string, nextTo: string) {
    if (!nextFrom && !nextTo) {
      router.push("/");
      return;
    }
    const f = nextFrom || nextTo;
    const t = nextTo || nextFrom;
    // نضمن إن البداية قبل النهاية
    const [lo, hi] = f <= t ? [f, t] : [t, f];
    router.push(`/?from=${lo}&to=${hi}`);
  }

  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="اختار يوم أو فترة"
        aria-label="اختار يوم أو فترة من التقويم"
        className={`rounded-full p-1.5 shadow-card ${
          active
            ? "bg-primary text-white"
            : "bg-surface text-ink-muted hover:bg-sunken"
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zm10 6H4v8h12V8z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {active && (
        <button
          type="button"
          onClick={() => router.push("/")}
          title="إلغاء الفترة المختارة"
          className="rounded-full bg-surface px-2 py-1 text-xs text-ink-muted shadow-card hover:bg-sunken"
        >
          ✕
        </button>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          ></div>
          <div className="absolute top-full z-50 mt-2 flex w-max max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-xl ltr:left-0 rtl:left-0">
            <label className="flex items-center justify-between gap-3 text-xs text-ink-muted">
              <span>من</span>
              <input
                type="date"
                defaultValue={from ?? ""}
                onChange={(e) => apply(e.target.value, to ?? "")}
                className="rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-ink-muted">
              <span>إلى</span>
              <input
                type="date"
                defaultValue={to ?? ""}
                onChange={(e) => apply(from ?? "", e.target.value)}
                className="rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </label>
            <p className="text-[11px] text-ink-faint">
              سيب &quot;إلى&quot; فاضية عشان يوم واحد بس
            </p>
          </div>
        </>
      )}
    </span>
  );
}
