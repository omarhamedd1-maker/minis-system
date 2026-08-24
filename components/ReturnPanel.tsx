"use client";

import { useState } from "react";
import { BostaMark } from "./BostaMark";

type Item = {
  id: string;
  name: string;
  quantity: number;
  returnedQuantity: number;
};

// لوحة المرتجع: زرار واحد، وأول ما تدوس تختار المنتجات وكمياتها بأسهم
export function ReturnPanel({
  orderId,
  items,
  returnTracking,
  canSend,
  saveAction,
  shipmentAction,
}: {
  orderId: string;
  items: Item[];
  returnTracking: string | null;
  canSend: boolean;
  saveAction: (fd: FormData) => Promise<void>;
  shipmentAction: (fd: FormData) => Promise<void>;
}) {
  const alreadyMarked = items.some((i) => i.returnedQuantity > 0);
  const [open, setOpen] = useState(alreadyMarked);
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.returnedQuantity]))
  );

  const totalReturning = Object.values(qty).reduce((s, n) => s + n, 0);

  function bump(id: string, delta: number, max: number) {
    setQty((prev) => {
      const next = Math.min(Math.max((prev[id] ?? 0) + delta, 0), max);
      return { ...prev, [id]: next };
    });
  }

  // خلاص عملنا شحنة مرتجع
  if (returnTracking) {
    return (
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-gray-900">المرتجع</h2>
        <p className="text-sm text-gray-700">
          شحنة المرتجع اتعملت — رقم التتبع{" "}
          <span className="font-medium" dir="ltr">
            {returnTracking}
          </span>
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-900">المرتجع</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"
        >
          <BostaMark className="h-4 w-4" />
          اعمل شحنة مرتجع من العميل
        </button>
      </div>
    );
  }

  return (
    <div className="minis-in rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">المرتجع</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          إلغاء
        </button>
      </div>

      {/* اختار المنتجات الراجعة بالأسهم */}
      <form action={saveAction} className="space-y-2">
        <input type="hidden" name="order_id" value={orderId} />
        {items.map((i) => (
          <div
            key={i.id}
            className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-xs text-gray-800">
              {i.name}
              <span className="text-gray-400"> (من {i.quantity})</span>
            </span>
            <input type="hidden" name={`ret_${i.id}`} value={qty[i.id] ?? 0} />
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => bump(i.id, -1, i.quantity)}
                aria-label="أقل"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-600 shadow-sm disabled:opacity-40"
                disabled={(qty[i.id] ?? 0) <= 0}
              >
                −
              </button>
              <span className="w-7 text-center text-sm font-medium text-gray-900">
                {qty[i.id] ?? 0}
              </span>
              <button
                type="button"
                onClick={() => bump(i.id, 1, i.quantity)}
                aria-label="أكتر"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-600 shadow-sm disabled:opacity-40"
                disabled={(qty[i.id] ?? 0) >= i.quantity}
              >
                +
              </button>
            </div>
          </div>
        ))}

        <input
          name="return_tracking"
          placeholder="رقم شحنة المرتجع (لو عملتها يدوي)"
          dir="ltr"
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
        />

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={totalReturning === 0}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            حفظ ({totalReturning})
          </button>
        </div>
      </form>

      {/* شحنة المرتجع من بوسطة */}
      {canSend && alreadyMarked && (
        <form action={shipmentAction} className="mt-3 border-t border-gray-100 pt-3">
          <input type="hidden" name="order_id" value={orderId} />
          <button
            type="submit"
            onClick={(e) => {
              if (
                !confirm(
                  "تعمل شحنة مرتجع؟ بوسطة هتروح تسحب المنتجات المحددة من عند العميل."
                )
              )
                e.preventDefault();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"
          >
            <BostaMark className="h-4 w-4" />
            اطلب الشحنة من بوسطة
          </button>
        </form>
      )}
    </div>
  );
}
