"use client";

import { useState, useTransition } from "react";
import type { TrackResult } from "@/app/track/[tracking]/actions";

/**
 * بوابة تفاصيل الأوردر في صفحة التتبع.
 *
 * ⚠️⚠️ **الحالة بتبان للكل، والتفاصيل بعد التليفون بس.** اللي معاه اللينك
 * يعرف الشحنة فين، واللي هو صاحب الأوردر بس يشوف المنتجات والعنوان والمبلغ.
 *
 * ⚠️ **والتليفون مابيتحطش في اللينك أبدًا** — بيتبعت في جسم الطلب. الرقم في
 * اللينك بيفضل في تاريخ المتصفح وفي سجلات أي سيرفر بينهم.
 */
export function TrackGate({
  tracking,
  action,
}: {
  tracking: string;
  action: (tracking: string, phone: string) => Promise<TrackResult>;
}) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<TrackResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    const d = result;
    return (
      <div className="mt-8 space-y-4 border-t border-gray-100 pt-6">
        <Row label="رقم الأوردر" value={d.orderNumber ? `#${d.orderNumber}` : "—"} />
        {d.orderDate && (
          <Row label="اتعمل يوم" value={d.orderDate.slice(0, 10)} />
        )}
        {d.deliveredAt && (
          <Row label="اتسلّم يوم" value={d.deliveredAt.slice(0, 10)} />
        )}
        {d.cod && (
          <Row
            label="المطلوب عند الاستلام"
            value={d.collected ? `${d.cod} — اتدفع` : d.cod}
          />
        )}
        {d.address && <Row label="العنوان" value={d.address} />}

        {d.items.length > 0 && (
          <div>
            <p className="text-xs text-gray-400">اللي جواها</p>
            <ul className="mt-1 space-y-1">
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
      className="mt-8 border-t border-gray-100 pt-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await action(tracking, phone)));
      }}
    >
      <label className="text-sm text-gray-600">
        عايز تشوف تفاصيل الأوردر؟ اكتب رقم التليفون اللي عليه.
      </label>

      <div className="mt-2 flex gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="01xxxxxxxxx"
          dir="ltr"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? "…" : "اعرض"}
        </button>
      </div>

      {result && !result.ok && (
        <p className="mt-2 text-sm text-red-600">{result.error}</p>
      )}
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}
