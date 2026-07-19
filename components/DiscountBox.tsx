"use client";

import { useState } from "react";

export function DiscountBox({
  orderId,
  itemsTotal,
  currentDiscount,
  updateAction,
}: {
  orderId: string;
  itemsTotal: number;
  currentDiscount: number;
  updateAction: (formData: FormData) => Promise<void>;
}) {
  const [mode, setMode] = useState<"amount" | "percent">("amount");

  return (
    <form action={updateAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="items_total" value={itemsTotal} />
      <input type="hidden" name="discount_mode" value={mode} />
      <div className="flex overflow-hidden rounded-lg border border-gray-300">
        <button
          type="button"
          onClick={() => setMode("amount")}
          className={`px-2 py-1 text-xs font-medium ${
            mode === "amount"
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600"
          }`}
        >
          مبلغ
        </button>
        <button
          type="button"
          onClick={() => setMode("percent")}
          className={`px-2 py-1 text-xs font-medium ${
            mode === "percent"
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600"
          }`}
        >
          نسبة %
        </button>
      </div>
      <input
        type="number"
        name="discount_value"
        defaultValue={mode === "amount" ? currentDiscount : 0}
        min={0}
        step="0.01"
        placeholder={mode === "amount" ? "بالجنيه" : "%"}
        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
        aria-label="قيمة الخصم"
      />
      <button
        type="submit"
        className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
      >
        حفظ
      </button>
    </form>
  );
}
