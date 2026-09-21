"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewResult } from "@/app/(dashboard)/cash/payout-actions";

/**
 * ==========================================================================
 * أفعال التحويل — وفيهم مافيش «حذف» (قرار عمر ٢١ سبتمبر)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **زرار اسمه «حذف» ممنوع هنا** (نفس قاعدة حركات الخزنة · MONEY
 * §٦.٢): في سجل مالي المسح بيغيّر الرصيد بأثر رجعي ومحدش يعرف ليه.
 * فكل فعل بيتسمّى باللي بيعمله في الفلوس بالظبط:
 *
 *   فُك الربط    ← الحركة تفضل · الرصيد ما يتغيّرش · التحويل يرجع مراجعة
 *   ألغِ التحويل ← يتشال · وحركته (اللي هو عملها) تتلغي بحركة عكسية
 *   أخفِ         ← يتأرشف ويفضل في التاريخ
 *
 * ⚠️ **والإلغاء بيسأل الأول** — ده الفعل الوحيد اللي ممكن يغيّر رصيد.
 * ==========================================================================
 */
export function PayoutActions({
  payoutId,
  linked,
  archived,
  unlinkAction,
  cancelAction,
  archiveAction,
}: {
  payoutId: string;
  /** مربوط بحركة خزنة؟ — «فُك الربط» مالوش معنى من غيرها */
  linked: boolean;
  archived: boolean;
  unlinkAction: (payoutId: string) => Promise<ReviewResult>;
  cancelAction: (payoutId: string) => Promise<ReviewResult>;
  archiveAction: (payoutId: string, archived: boolean) => Promise<ReviewResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<ReviewResult | null>(null);

  async function run(fn: () => Promise<ReviewResult>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg(r);
    setAsking(false);
    if (r.ok) router.refresh();
  }

  const button =
    "min-h-9 rounded-control px-3 py-1.5 text-xs font-medium disabled:opacity-50";

  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="flex flex-wrap items-center gap-2">
        {linked && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => unlinkAction(payoutId))}
            title="الحركة تفضل زي ما هي والرصيد ما يتغيّرش"
            className={`${button} bg-sunken text-ink-body hover:bg-line`}
          >
            فُك الربط
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setAsking(true)}
          className={`${button} bg-sunken text-danger hover:bg-danger-soft`}
        >
          ألغِ التحويل
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => archiveAction(payoutId, !archived))}
          title="بيفضل في التاريخ وفي الحسابات"
          className={`${button} bg-sunken text-ink-muted hover:bg-line`}
        >
          {archived ? "رجّعه" : "أخفِ"}
        </button>
      </div>

      {asking && (
        <div className="mt-2 rounded-control bg-danger-soft px-3 py-2 text-xs text-danger">
          <p className="font-medium">التحويل هيتشال.</p>
          <p className="mt-0.5">
            لو هو اللي عمل حركة الخزنة، الحركة هتتلغي بحركة عكسية والرصيد
            هينقص. ولو كان مربوط بحركة موجودة قبله، الفلوس مش هتتلمس.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => cancelAction(payoutId))}
              className={`${button} bg-danger text-white hover:opacity-90`}
            >
              {busy ? "بيتشال…" : "أيوه، ألغِ"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsking(false)}
              className={`${button} bg-surface text-ink-body`}
            >
              سيبه
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p
          className={`mt-2 text-xs ${msg.ok ? "text-success" : "text-danger"}`}
        >
          {msg.ok ? msg.message : msg.error}
        </p>
      )}
    </div>
  );
}
