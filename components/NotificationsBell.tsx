"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Notice } from "@/lib/notifications";
import { SendAnnouncement, type NotifyMember } from "./SendAnnouncement";
import type { AnnounceState } from "@/app/(dashboard)/notify/actions";

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

/**
 * جرس الإشعارات — بيعرض الواقف، **وبيبعت كمان** لو معاك الصلاحية.
 *
 * زرار الإرسال جوّه الجرس مش في القايمة الجنبية بقرار من عمر: الجرس هو
 * مكان الإشعارات في السيستم، فاللي بيبعت واحد يلاقيه في نفس المكان اللي
 * بيستقبل فيه.
 */
export function NotificationsBell({
  notices,
  canNotify,
  team,
  senderName,
  sendAction,
}: {
  notices: Notice[];
  canNotify?: boolean;
  team?: NotifyMember[];
  senderName?: string;
  sendAction?: (prev: AnnounceState, fd: FormData) => Promise<AnnounceState>;
}) {
  const [open, setOpen] = useState(false);
  // بيتفتح على قايمة الإشعارات دايمًا — الكتابة اختيار تاني
  const [composing, setComposing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canSend = Boolean(canNotify && sendAction);

  // القفل بيرجّع الجرس لقايمة الإشعارات — عشان لما تفتحه تاني تلاقي
  // الإشعارات مش فورم نصّه مكتوب من ساعة
  const close = () => {
    setOpen(false);
    setComposing(false);
  };

  // الدوسة برّه بتقفل — ومابتعملش حاجة تانية
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) close();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
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
        onClick={() => (open ? close() : setOpen(true))}
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
        <div
          className={`absolute end-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ${
            composing
              ? "w-[min(22rem,calc(100vw-2rem))]"
              : "w-[min(20rem,calc(100vw-2rem))]"
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-bold text-gray-700">
              {composing ? "ابعت إشعار للتيم" : "الإشعارات"}
            </span>
            {canSend &&
              (composing ? (
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="text-[11px] font-medium text-gray-400 hover:text-gray-700"
                >
                  رجوع
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  title="ابعت إشعار للتيم"
                  aria-label="ابعت إشعار للتيم"
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-primary hover:text-white"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              ))}
          </div>

          {composing && sendAction ? (
            <SendAnnouncement
              team={team ?? []}
              senderName={senderName ?? "الإدارة"}
              action={sendAction}
              onDone={close}
            />
          ) : notices.length === 0 ? (
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
                        onClick={close}
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
