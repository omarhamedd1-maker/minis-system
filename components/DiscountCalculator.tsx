"use client";

import { useState } from "react";
import {
  priceOutcome,
  safeDiscount,
  safeDiscountPercent,
} from "@/lib/discount-calculator";
import { formatMoney } from "@/lib/format";

/**
 * حاسبة الخصم الآمن على الشكل.
 *
 * ⚠️ **الأرقام كلها جاية من داتاك** — السعر والتكلفة من المنتج، والشحن من
 * إعداداتك، ونسبة الرجوع من شحناتك اللي خلصت. مافيش رقم مخترع.
 *
 * ⚠️ **والحسبة بتحصل في المتصفح** عشان تحرّك الخصم وتشوف الرقم بيتغيّر
 * على طول.
 */
export function DiscountCalculator({
  price,
  cost,
  shippingCharged,
  shippingCost,
  returnRate,
}: {
  price: number;
  cost: number;
  shippingCharged: number;
  shippingCost: number;
  returnRate: number;
}) {
  const input = { price, cost, shippingCharged, shippingCost, returnRate };
  const max = safeDiscount(input);
  const maxPct = safeDiscountPercent(input);
  const [discount, setDiscount] = useState(0);
  const now = priceOutcome(input, discount);

  if (cost <= 0) {
    return (
      <p className="text-sm text-gray-500">
        ⚠️ تكلفة الشكل ده صفر، فمفيش حساب ربح ليه. اكتب التكلفة فوق الأول.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-gray-600">أكبر خصم قبل الخسارة</span>
        <span className="text-lg font-bold tabular-nums text-gray-900">
          {formatMoney(max)}{" "}
          <span className="text-xs font-normal text-gray-400">({maxPct}%)</span>
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(price))}
        value={discount}
        onChange={(e) => setDiscount(Number(e.target.value))}
        className="mt-3 w-full accent-gray-900"
      />

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Cell label="الخصم" value={formatMoney(discount)} />
        <Cell
          label="لو وصل"
          value={formatMoney(now.profitIfDelivered)}
          danger={now.profitIfDelivered < 0}
        />
        <Cell
          label="المتوقع"
          value={formatMoney(now.expected)}
          danger={now.expected < 0}
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
        «المتوقع» بيدخل فيه إن {Math.round(returnRate * 100)}% من شحناتك بترجع —
        والشحنة اللي بترجع بتدفع شحن ومابتحصّلش.
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p
        className={`text-sm font-bold tabular-nums ${
          danger ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
