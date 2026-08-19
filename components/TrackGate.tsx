"use client";

import { useState, useTransition } from "react";
import type { TrackResult } from "@/app/track/[tracking]/actions";
import { UI } from "@/lib/tracking-copy";

/**
 * بوابة تفاصيل الأوردر في صفحة التتبع.
 *
 * ⚠️⚠️ **الحالة بتبان للكل، والتفاصيل بعد آخر أرقام التليفون بس.**
 *
 * ⚠️ **والأرقام مابتتحطش في اللينك أبدًا** — بتتبعت في جسم الطلب. اللي في
 * اللينك بيفضل في تاريخ المتصفح وفي سجلات أي سيرفر بينهم.
 */
export function TrackGate({
  tracking,
  action,
}: {
  tracking: string;
  action: (tracking: string, typed: string) => Promise<TrackResult>;
}) {
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<TrackResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    const d = result;
    return (
      <div className="mt-10 space-y-5 border-t border-gray-100 pt-8">
        <div className="grid grid-cols-2 gap-5">
          {d.orderNumber && <Row label={UI.orderNumber} value={`#${d.orderNumber}`} />}
          {d.placedAt && <Row label={UI.placed} value={day(d.placedAt)} />}
          {d.deliveredAt && (
            <Row label={UI.deliveredOn} value={day(d.deliveredAt)} />
          )}
          {d.cod && (
            <Row
              label={UI.toPay}
              value={d.collected ? `${d.cod} · ${UI.paid}` : d.cod}
            />
          )}
        </div>

        {d.address && <Row label={UI.address} value={d.address} />}

        {d.items.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">
              {UI.items}
            </p>
            <ul className="mt-2 space-y-1">
              {d.items.map((i, n) => (
                <li key={n} className="text-sm text-gray-900">
                  {i.name}
                  {i.quantity > 1 && (
                    <span className="text-gray-400"> × {i.quantity}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      className="mt-10 border-t border-gray-100 pt-8"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await action(tracking, typed)));
      }}
    >
      <label className="block text-sm leading-relaxed text-gray-600">
        {UI.detailsPrompt}
      </label>

      <div className="mt-3 flex gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          inputMode="numeric"
          maxLength={11}
          placeholder={UI.detailsPlaceholder}
          dir="ltr"
          className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm tracking-widest text-gray-900 focus:border-gray-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gray-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
        >
          {pending ? "…" : UI.detailsButton}
        </button>
      </div>

      {result && !result.ok && (
        <p className="mt-3 text-sm text-gray-500">{result.error}</p>
      )}
    </form>
  );
}

/** التاريخ بشكل إنجليزي قصير */
function day(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-900">{value}</p>
    </div>
  );
}
