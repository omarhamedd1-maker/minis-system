"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { splitBundlePrice, itemsValue, bundleCost } from "@/lib/bundle";

type Variant = { id: string; name: string; price: number; cost: number };

type Line = { variantId: string; quantity: number };

/**
 * عمل باقة — والأرقام بتتحرّك وإنت بتكتب.
 *
 * ⚠️⚠️ **الحسبة هنا للعرض بس.** السيرفر بيقرا الأسعار والتكاليف من
 * الداتابيز تاني ويعيد الفحص — لو اعتمدنا على اللي جاي من الصفحة، أي حد
 * يقدر يبعت سعر بند بجنيه ويعدّي فحص «الباقة أرخص من بنودها» وهي خسارة.
 */
export function BundleForm({
  variants,
  create,
}: {
  variants: Variant[];
  create: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([
    { variantId: "", quantity: 1 },
    { variantId: "", quantity: 1 },
  ]);
  const [price, setPrice] = useState("");

  const byId = new Map(variants.map((v) => [v.id, v]));

  const items = lines
    .filter((l) => l.variantId && l.quantity > 0)
    .map((l) => {
      const v = byId.get(l.variantId)!;
      return {
        variantId: v.id,
        name: v.name,
        quantity: l.quantity,
        unitPrice: v.price,
        unitCost: v.cost,
      };
    });

  const full = itemsValue(items);
  const cost = bundleCost(items);
  const priceNum = Number(price) || 0;
  const preview =
    items.length >= 2 && priceNum > 0
      ? splitBundlePrice({ name: "x", price: priceNum, items })
      : [];

  const profit = priceNum > 0 ? priceNum - cost : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
      >
        باقة جديدة
      </button>
    );
  }

  return (
    <form action={create} className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="bundle-name" className="text-xs text-gray-500">
            اسم الباقة
          </label>
          <input
            id="bundle-name"
            name="name"
            required
            placeholder="طقم المطبخ"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bundle-price" className="text-xs text-gray-500">
            سعر الباقة
          </label>
          <input
            id="bundle-price"
            name="price"
            type="number"
            min="1"
            step="0.01"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              name="variant_id"
              value={l.variantId}
              onChange={(e) =>
                setLines((x) =>
                  x.map((y, n) =>
                    n === i ? { ...y, variantId: e.target.value } : y
                  )
                )
              }
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            >
              <option value="">اختار منتج</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {formatMoney(Math.round(v.price))}
                </option>
              ))}
            </select>
            <input
              name="quantity"
              type="number"
              min="1"
              step="1"
              value={l.quantity}
              onChange={(e) =>
                setLines((x) =>
                  x.map((y, n) =>
                    n === i ? { ...y, quantity: Number(e.target.value) } : y
                  )
                )
              }
              className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
            {lines.length > 2 && (
              <button
                type="button"
                onClick={() => setLines((x) => x.filter((_, n) => n !== i))}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100"
                aria-label="شيل السطر"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setLines((x) => [...x, { variantId: "", quantity: 1 }])}
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          + منتج تاني
        </button>
      </div>

      {items.length >= 2 && (
        <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="text-gray-500">
              لوحدهم {formatMoney(Math.round(full))}
              {priceNum > 0 && full > priceNum && (
                <> · العميل بيوفّر {formatMoney(Math.round(full - priceNum))}</>
              )}
            </span>
            {priceNum > 0 && cost > 0 && (
              <span
                className={
                  profit < 0 ? "font-medium text-red-600" : "text-gray-500"
                }
              >
                ربحك {formatMoney(Math.round(profit))}
              </span>
            )}
          </div>

          {preview.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {preview.map((l) => (
                <div
                  key={l.variantId}
                  className="flex items-baseline justify-between gap-3 text-[11px] text-gray-400"
                >
                  <span>
                    {l.quantity > 1 && `${l.quantity} × `}
                    {l.name}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(Math.round(l.salePrice * l.quantity))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            السعر بيتوزّع بنسبة سعر كل منتج — مش خصم واحد على الكل. كده ربح كل
            منتج بيفضل صح لوحده.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
          اعمل الباقة
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
        >
          إلغاء
        </button>
        <input
          name="note"
          placeholder="ملاحظة (اختياري)"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </div>
    </form>
  );
}
