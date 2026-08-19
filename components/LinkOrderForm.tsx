"use client";

import { useState, useTransition } from "react";
import type { LinkResult } from "@/app/o/[id]/actions";
import { MAX_QUANTITY } from "@/lib/order-link";

/**
 * فورم الطلب اللي العميل بيملاه.
 *
 * ⚠️ **العنوان خانة كبيرة مش سطر** — العميل بيكتب أكتر لما المساحة تسمح،
 * وأكبر سبب رجوع بعد الرفض هو العنوان الناقص.
 *
 * ⚠️ **ومفيش خانة إيميل ولا حاجة مش لازمة** — كل خانة زيادة بتقلّل اللي
 * بيكمّلوا.
 */
export function LinkOrderForm({
  linkId,
  price,
  action,
}: {
  linkId: string;
  price: number;
  action: (linkId: string, input: Record<string, unknown>) => Promise<LinkResult>;
}) {
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<LinkResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    return (
      <div className="mt-8 rounded-2xl bg-emerald-50 p-6 text-center">
        <p className="text-lg font-bold text-emerald-900">وصلنا طلبك ✅</p>
        <p className="mt-2 text-sm text-emerald-800">
          هنكلّمك نأكّد الطلب والعنوان قبل ما نشحنه.
        </p>
        <p className="mt-3 text-xs text-emerald-700">
          رقم الطلب {result.orderNumber}
        </p>
      </div>
    );
  }

  return (
    <form
      className="mt-8 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () =>
          setResult(
            await action(linkId, {
              fullName: form.get("full_name"),
              phone: form.get("phone"),
              address: form.get("address"),
              quantity,
            })
          )
        );
      }}
    >
      <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
        <span className="text-sm text-gray-600">الكمية</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-8 w-8 rounded-full bg-white text-lg leading-none text-gray-700 shadow-sm"
          >
            −
          </button>
          <span className="w-6 text-center text-sm font-bold tabular-nums">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
            className="h-8 w-8 rounded-full bg-white text-lg leading-none text-gray-700 shadow-sm"
          >
            +
          </button>
        </div>
      </div>

      <input
        name="full_name"
        placeholder="اسمك"
        autoComplete="name"
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-gray-900 focus:outline-none"
      />
      <input
        name="phone"
        placeholder="رقم الموبايل"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-gray-900 focus:outline-none"
      />
      <textarea
        name="address"
        rows={3}
        placeholder="العنوان بالتفصيل — الشارع ورقم العمارة والدور والشقة وعلامة مميزة"
        autoComplete="street-address"
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-gray-900 focus:outline-none"
      />

      {result && !result.ok && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {result.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-gray-900 py-3.5 text-sm font-bold text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {pending
          ? "بنسجّل طلبك…"
          : `اطلب الآن — ${Math.round(price * quantity).toLocaleString("ar-EG")} جنيه`}
      </button>

      <p className="text-center text-[11px] text-gray-400">
        الدفع عند الاستلام · هنكلّمك نأكّد قبل الشحن
      </p>
    </form>
  );
}
