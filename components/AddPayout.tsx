"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewResult } from "@/app/(dashboard)/cash/payout-actions";

/**
 * إضافة تحويل بالإيد (TRANSFERS §٩).
 *
 * ⚠️ **لازمتها:** الكشف بينزل كل فترة والإيميل لسه مش موصّل، فالتحويل اللي
 * حصل النهاردة مالوش طريق يدخل بيه — والخزنة بتفضل فيها حركة يدوية مالهاش
 * مصدر.
 *
 * ⚠️ **ومابتعملش حركة خزنة** — بتربط باللي موجود، واللي مالوش حركة بيستنى
 * دوسة «اعمل حركة».
 */
export function AddPayout({
  action,
  today,
}: {
  action: (formData: FormData) => Promise<ReviewResult>;
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ReviewResult | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    const r = await action(formData);
    setBusy(false);
    setMsg(r);
    if (r.ok) router.refresh();
  }

  const field =
    "rounded-control border border-line-strong px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none";

  return (
    <details className="group rounded-card bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-control bg-primary text-white transition-transform group-open:rotate-45"
        >
          +
        </span>
        تحويل بالإيد
      </summary>

      <form action={submit} className="flex flex-wrap items-end gap-3 border-t border-line p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="payout_net" className="text-xs text-ink-muted">
            المبلغ اللي نزل (جنيه)
          </label>
          <input
            id="payout_net"
            name="net_amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            className={`${field} w-32`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="payout_date" className="text-xs text-ink-muted">
            تاريخ التحويل
          </label>
          <input
            id="payout_date"
            name="payout_date"
            type="date"
            defaultValue={today}
            required
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="payout_invoice" className="text-xs text-ink-muted">
            رقم الفاتورة (اختياري)
          </label>
          <input
            id="payout_invoice"
            name="invoice_number"
            dir="ltr"
            placeholder="SUNCOD06SEP26"
            className={`${field} w-44 font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="payout_fees" className="text-xs text-ink-muted">
            الرسوم (اختياري)
          </label>
          <input
            id="payout_fees"
            name="fees_amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className={`${field} w-28`}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {busy ? "بيتسجّل…" : "سجّل التحويل"}
        </button>
        {msg && (
          <p className={`w-full text-xs ${msg.ok ? "text-success" : "text-danger"}`}>
            {msg.ok ? msg.message : msg.error}
          </p>
        )}
      </form>
    </details>
  );
}
