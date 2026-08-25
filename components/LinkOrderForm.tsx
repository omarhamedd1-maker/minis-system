"use client";

import { useState, useTransition } from "react";
import type { LinkResult } from "@/app/o/[id]/actions";
import { MAX_QUANTITY } from "@/lib/order-link";

export type LinkItem = {
  variantId: string;
  title: string;
  price: number;
  image: string | null;
};

/**
 * سلة اللينك اللي العميل بيملاها.
 *
 * ⚠️ **المنتج الواحد بيبدأ بكمية ١، والأكتر بيبدأ بصفر** — لو اللينك فيه
 * منتج واحد يبقى ده اللي هو جاي عشانه؛ ولو فيه خمسة، البداية بصفر بتخلّيه
 * يختار بدل ما يشيل.
 *
 * ⚠️ **والعنوان خانة كبيرة مش سطر** — العميل بيكتب أكتر لما المساحة تسمح،
 * والعنوان الناقص تاني أكبر سبب رجوع.
 */
export function LinkOrderForm({
  linkId,
  items,
  shipping,
  action,
}: {
  linkId: string;
  items: LinkItem[];
  shipping: number;
  action: (
    linkId: string,
    input: Record<string, unknown>
  ) => Promise<LinkResult>;
}) {
  const single = items.length === 1;
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.variantId, single ? 1 : 0]))
  );
  const [result, setResult] = useState<LinkResult | null>(null);
  const [pending, start] = useTransition();

  const chosen = items.filter((i) => (qty[i.variantId] ?? 0) > 0);
  const goods = chosen.reduce((s, i) => s + i.price * (qty[i.variantId] ?? 0), 0);
  const total = goods + (chosen.length > 0 ? shipping : 0);

  const money = (n: number) => Math.round(n).toLocaleString("ar-EG");

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
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () =>
          setResult(
            await action(linkId, {
              fullName: form.get("full_name"),
              phone: form.get("phone"),
              address: form.get("address"),
              items: chosen.map((i) => ({
                variantId: i.variantId,
                quantity: qty[i.variantId] ?? 0,
              })),
            })
          )
        );
      }}
    >
      <div className="space-y-2">
        {items.map((i) => {
          const q = qty[i.variantId] ?? 0;
          return (
            <div
              key={i.variantId}
              className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                q > 0 ? "border-gray-900 bg-white" : "border-gray-100 bg-gray-50"
              }`}
            >
              {i.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={i.image}
                  alt={i.title}
                  className="h-14 w-14 shrink-0 rounded-lg bg-white object-cover"
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-900">{i.title}</p>
                <p className="text-sm font-bold tabular-nums text-gray-900">
                  {money(i.price)} جنيه
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setQty((s) => ({
                      ...s,
                      [i.variantId]: Math.max(0, (s[i.variantId] ?? 0) - 1),
                    }))
                  }
                  className="h-8 w-8 rounded-full bg-gray-100 text-lg leading-none text-gray-700"
                >
                  −
                </button>
                <span className="w-5 text-center text-sm font-bold tabular-nums">
                  {q}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setQty((s) => ({
                      ...s,
                      [i.variantId]: Math.min(MAX_QUANTITY, (s[i.variantId] ?? 0) + 1),
                    }))
                  }
                  className="h-8 w-8 rounded-full bg-primary text-lg leading-none text-white"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
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
        disabled={pending || chosen.length === 0}
        className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-40"
      >
        {pending
          ? "بنسجّل طلبك…"
          : chosen.length === 0
            ? "اختار اللي عايزه"
            : `اطلب الآن — ${money(total)} جنيه`}
      </button>

      <p className="text-center text-[11px] text-gray-400">
        {shipping > 0 && chosen.length > 0
          ? `شامل الشحن ${money(shipping)} جنيه · الدفع عند الاستلام`
          : "الدفع عند الاستلام · هنكلّمك نأكّد قبل الشحن"}
      </p>
    </form>
  );
}
