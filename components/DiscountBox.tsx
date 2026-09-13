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
      <div className="flex overflow-hidden rounded-control border border-line-strong">
        <button
          type="button"
          onClick={() => setMode("amount")}
          className={`px-2 py-1 text-xs font-medium ${
            mode === "amount"
              ? "bg-primary text-white"
              : "bg-surface text-ink-muted"
          }`}
        >
          مبلغ
        </button>
        <button
          type="button"
          onClick={() => setMode("percent")}
          className={`px-2 py-1 text-xs font-medium ${
            mode === "percent"
              ? "bg-primary text-white"
              : "bg-surface text-ink-muted"
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
        className="w-24 rounded-control border border-line-strong px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
        aria-label="قيمة الخصم"
      />
      <button
        type="submit"
        className="rounded-control bg-sunken px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-line"
      >
        حفظ
      </button>
    </form>
  );
}
