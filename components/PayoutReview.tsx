"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewResult } from "@/app/(dashboard)/cash/payout-actions";

/**
 * حسم تحويل «محتاج مراجعة» (TRANSFERS §٨ · الخطوة ٤).
 *
 * ⚠️ **الحركة بتتعمل بدوسة بس** — الاستيراد نفسه عمره ما بيغيّر رصيد.
 * ⚠️ **والتصليح بحركة عكسية + حركة صح** مش تعديل في مكانه (MONEY §٦.٢)،
 * عشان الدفتر يفضل فيه أثر إن الرقم كان غلط ومين صلّحه.
 */
export function PayoutReview({
  payoutId,
  net,
  candidate,
  createAction,
  fixAction,
  acceptAction,
}: {
  payoutId: string;
  net: number;
  /** الحركة اليدوية القريبة بمبلغ مختلف — لو فيه */
  candidate: { id: string; amount: number; difference: number } | null;
  createAction: (payoutId: string) => Promise<ReviewResult>;
  fixAction: (payoutId: string, cashId: string) => Promise<ReviewResult>;
  acceptAction: (payoutId: string, cashId: string, difference: number) => Promise<ReviewResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ReviewResult | null>(null);

  async function run(fn: () => Promise<ReviewResult>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg(r);
    if (r.ok) router.refresh();
  }

  const button =
    "min-h-11 rounded-control px-3 py-1.5 text-xs font-medium disabled:opacity-50";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {candidate ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => fixAction(payoutId, candidate.id))}
            className={`${button} bg-primary text-white hover:bg-primary-dark`}
          >
            صلّح الحركة لـ{net}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() => acceptAction(payoutId, candidate.id, candidate.difference))
            }
            className={`${button} bg-sunken text-ink-body hover:bg-line`}
          >
            اقبل الفرق ({candidate.difference})
          </button>
          <span className="text-[11px] text-ink-faint">
            الحركة المسجّلة {candidate.amount}
          </span>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => createAction(payoutId))}
          className={`${button} bg-primary text-white hover:bg-primary-dark`}
        >
          اعمل حركة بـ{net}
        </button>
      )}
      {msg && (
        <span className={`text-[11px] ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.ok ? msg.message : msg.error}
        </span>
      )}
    </div>
  );
}
