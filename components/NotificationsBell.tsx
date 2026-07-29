"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Notice } from "@/lib/notifications";

const DOT: Record<Notice["level"], string> = {
  danger: "bg-red-500",
  warn: "bg-orange-500",
  info: "bg-sky-500",
};

const TEXT: Record<Notice["level"], string> = {
  danger: "text-red-700",
  warn: "text-orange-700",
  info: "text-sky-700",
};

export function NotificationsBell({ notices }: { notices: Notice[] }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // الدوسة برّه بتقفل — ومابتعملش حاجة تانية
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const worst = notices[0]?.level;
  // العدد = مجموع الأوردرات، والمشاكل اللي مالهاش عدد بتتحسب واحدة
  const total = notices.reduce((s, n) => s + (n.count ?? 1), 0);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100"
        aria-label={total ? `${total} إشعار` : "الإشعارات"}
        title={total ? `${total} حاجة محتاجة تتحرك` : "مفيش إشعارات"}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
          <path d="M10 2a5 5 0 0 0-5 5v2.6l-1.1 2.2A1 1 0 0 0 4.8 14h10.4a1 1 0 0 0 .9-1.2L15 10.6V7a5 5 0 0 0-5-5Zm0 15a2.5 2.5 0 0 0 2.4-1.8H7.6A2.5 2.5 0 0 0 10 17Z" />
        </svg>
        {total > 0 && (
          <span
            className={`absolute -top-0.5 -left-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              worst ? DOT[worst] : "bg-gray-400"
            }`}
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-bold text-gray-700">
            الإشعارات
          </div>

          {notices.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-gray-400">
              مفيش حاجة واقفة — كل حاجة تمام
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {notices.map((n) => {
                const body = (
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[n.level]}`}
                    ></span>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold ${TEXT[n.level]}`}>
                        {n.title}
                        {n.count ? ` (${n.count})` : ""}
                      </div>
                      {n.detail && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                          {n.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className="block hover:bg-gray-50"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
