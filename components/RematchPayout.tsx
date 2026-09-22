"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewResult } from "@/app/(dashboard)/cash/payout-actions";

/**
 * ==========================================================================
 * «جرّب المطابقة تاني» — على أي تحويل مالوش أوردرات
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **الربط بالأوردرات مستقل تمامًا عن الربط بالحركة.** التحويل ممكن
 * يبقى «متأكّد» (فلوسه في الخزنة) و**مالوش ولا أوردر** — دول سؤالين
 * مختلفين: «الفلوس وصلت؟» و«فلوس أنهي أوردرات؟».
 *
 * الزرار كان جوّه شاشة المراجعة، فأول ما عمر دوس «اعمل حركة» على
 * `MONCOD21SEP26` التحويل بقى «متأكّد» و**الزرار اختفى** — والتلات
 * أوردرات فضلوا مش مربوطين من غير أي طريق يربطهم.
 *
 * فالشرط بقى **عدد الأوردرات** مش الحالة.
 * ==========================================================================
 */
export function RematchPayout({
  payoutId,
  action,
}: {
  payoutId: string;
  action: (payoutId: string) => Promise<ReviewResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ReviewResult | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await action(payoutId);
          setBusy(false);
          setMsg(r);
          if (r.ok) router.refresh();
        }}
        className="min-h-9 rounded-control border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-body hover:bg-sunken disabled:opacity-50"
      >
        {busy ? "بيطابق…" : "دوّر على أوردراته"}
      </button>
      {msg && (
        <span className={`text-[11px] ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.ok ? msg.message : msg.error}
        </span>
      )}
    </div>
  );
}
