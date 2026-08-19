"use client";

import { useState, useTransition } from "react";

/**
 * زرار «لينك طلب» على الشكل.
 *
 * ⚠️ **بينسخ اللينك على طول** — الهدف إنك تلزقه في رسالة، فخطوة زيادة بين
 * الزرار والنسخ معناها إنك مش هتستخدمه.
 */
export function OrderLinkButton({
  variantId,
  action,
}: {
  variantId: string;
  action: (
    variantId: string
  ) => Promise<{ ok: true; id: string; created: boolean } | { ok: false; error: string }>;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action(variantId);
            if (!r.ok) {
              setFailed(true);
              setNote(r.error);
              return;
            }
            const url = `${window.location.origin}/o/${r.id}`;
            try {
              await navigator.clipboard.writeText(url);
              setFailed(false);
              setNote("اتنسخ");
            } catch {
              // المتصفح رافض النسخ؟ نفتحه فيشوفه ويحدده بإيده
              setFailed(false);
              setNote(url);
              window.open(url, "_blank", "noopener");
            }
            setTimeout(() => setNote(null), 4000);
          })
        }
        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-200 disabled:opacity-50"
      >
        {pending ? "…" : "لينك طلب"}
      </button>

      {note && (
        <span
          className={`text-[11px] ${failed ? "text-red-600" : "text-emerald-600"}`}
        >
          {note}
        </span>
      )}
    </span>
  );
}
