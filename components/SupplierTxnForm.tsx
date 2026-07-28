"use client";

import { useState } from "react";

// تسجيل حركة للمورد: فاتورة (بضاعة استلمتها) أو دفعة (فلوس دفعتها له)
export function SupplierTxnForm({
  supplierId,
  today,
  action,
}: {
  supplierId: string;
  today: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const [kind, setKind] = useState<"purchase" | "payment">("purchase");
  const isPayment = kind === "payment";

  return (
    <form action={action} className="rounded-xl bg-white p-4 shadow-sm sm:p-5">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setKind("purchase")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            !isPayment
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 active:bg-gray-200"
          }`}
        >
          فاتورة بضاعة
        </button>
        <button
          type="button"
          onClick={() => setKind("payment")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isPayment
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-600 active:bg-gray-200"
          }`}
        >
          دفعة دفعتها
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {isPayment
          ? "فلوس طلعت منك للمورد — بتقلّل اللي عليك وبتتخصم من الخزنة."
          : "بضاعة استلمتها ولسه ما دفعتهاش — بتزوّد اللي عليك، والخزنة مش هتتأثر."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="amount" className="text-xs text-gray-500">
            المبلغ (جنيه)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="txn_date" className="text-xs text-gray-500">
            التاريخ
          </label>
          <input
            id="txn_date"
            name="txn_date"
            type="date"
            defaultValue={today}
            required
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-xs text-gray-500">
            الوصف (اختياري)
          </label>
          <input
            id="description"
            name="description"
            placeholder={isPayment ? "مثلاً: تحويل إنستا باي" : "مثلاً: 20 مرايا"}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {isPayment ? (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              name="hit_cash"
              defaultChecked
              className="h-4 w-4 rounded border-gray-300"
            />
            اخصمها من الخزنة
          </label>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white ${
            isPayment
              ? "bg-green-600 hover:bg-green-700"
              : "bg-gray-900 hover:bg-gray-700"
          }`}
        >
          {isPayment ? "تسجيل الدفعة" : "تسجيل الفاتورة"}
        </button>
      </div>
    </form>
  );
}
