"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

export type VariantOption = {
  id: string;
  label: string;
  cost: number;
};

type Row = {
  key: number;
  variantId: string;
  name: string;
  qty: string;
  cost: string;
};

let nextKey = 1;
const emptyRow = (): Row => ({
  key: nextKey++,
  variantId: "",
  name: "",
  qty: "1",
  cost: "",
});

// تسجيل حركة للمورد: فاتورة (بضاعة استلمتها) أو دفعة (فلوس دفعتها له)
export function SupplierTxnForm({
  supplierId,
  today,
  categories,
  variants,
  action,
}: {
  supplierId: string;
  today: string;
  categories: string[];
  variants: VariantOption[];
  action: (fd: FormData) => Promise<void>;
}) {
  const [kind, setKind] = useState<"purchase" | "payment">("purchase");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [manualAmount, setManualAmount] = useState("");
  const isPayment = kind === "payment";

  const filled = rows.filter(
    (r) => r.name.trim() && Number(r.qty) > 0 && r.cost !== ""
  );
  const itemsTotal = filled.reduce(
    (s, r) => s + Number(r.qty) * Number(r.cost),
    0
  );
  const hasItems = filled.length > 0;

  function patch(key: number, next: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }

  // لما يختار منتج من القايمة بنملّي الاسم والتكلفة الحالية تلقائي
  function pickVariant(key: number, variantId: string) {
    const v = variants.find((x) => x.id === variantId);
    patch(key, {
      variantId,
      name: v ? v.label : "",
      cost: v && v.cost > 0 ? String(v.cost) : "",
    });
  }

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
              ? "bg-primary text-white"
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
          ? "فلوس طلعت منك للمورد — بتتسجل مصروف وبتتخصم من الخزنة وبتقلّل اللي عليك."
          : "بضاعة أخدتها بالأجل — بتزوّد اللي عليك بس. مش مصروف ومش هتلمس الخزنة لحد ما تحاسبه."}
      </p>

      {/* ===== بنود الفاتورة: البضاعة اللي جِت بالظبط ===== */}
      {!isPayment && (
        <div className="mt-4 rounded-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-gray-900">
              البضاعة اللي جِت
            </span>
            <span className="text-xs text-gray-400">اختياري</span>
          </div>

          <div className="mt-2 space-y-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className="rounded-lg bg-gray-50 p-2 sm:flex sm:items-end sm:gap-2 sm:bg-transparent sm:p-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <select
                    value={r.variantId}
                    onChange={(e) => pickVariant(r.key, e.target.value)}
                    aria-label="المنتج"
                    className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">صنف مش في المنتجات — اكتبه بإيدك</option>
                    {variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  {!r.variantId && (
                    <input
                      value={r.name}
                      onChange={(e) => patch(r.key, { name: e.target.value })}
                      placeholder="اسم الصنف"
                      aria-label="اسم الصنف"
                      className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  )}
                </div>

                <div className="mt-2 flex items-end gap-2 sm:mt-0">
                  <input
                    value={r.qty}
                    onChange={(e) => patch(r.key, { qty: e.target.value })}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="عدد"
                    aria-label="الكمية"
                    className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={r.cost}
                    onChange={(e) => patch(r.key, { cost: e.target.value })}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="سعر القطعة"
                    aria-label="سعر القطعة"
                    className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <span className="min-w-16 flex-1 text-xs text-gray-500 sm:flex-none">
                    {Number(r.qty) > 0 && r.cost !== ""
                      ? formatMoney(Number(r.qty) * Number(r.cost))
                      : ""}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((rs) => rs.filter((x) => x.key !== r.key))
                      }
                      title="شيل الصنف"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        className="h-4 w-4"
                      >
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* اللي بيتبعت للسيرفر */}
                <input type="hidden" name="item_variant" value={r.variantId} />
                <input type="hidden" name="item_name" value={r.name} />
                <input type="hidden" name="item_qty" value={r.qty} />
                <input type="hidden" name="item_cost" value={r.cost} />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
            className="mt-2 flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 active:bg-gray-200"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-3.5 w-3.5"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            صنف تاني
          </button>

          {hasItems && (
            <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                name="update_stock"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              ضيف الكميات دي للمخزون وحدّث تكلفة المنتج بسعر الشرا
            </label>
          )}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="amount" className="text-xs text-gray-500">
            {hasItems && !isPayment ? "الإجمالي (من البنود)" : "المبلغ (جنيه)"}
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            readOnly={hasItems && !isPayment}
            value={hasItems && !isPayment ? String(itemsTotal) : manualAmount}
            onChange={(e) => setManualAmount(e.target.value)}
            className={`rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none ${
              hasItems && !isPayment ? "bg-gray-100" : ""
            }`}
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
            placeholder={isPayment ? "مثلاً: تحويل إنستا باي" : "مثلاً: شحنة يوليو"}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {isPayment ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="category" className="text-xs text-gray-500">
                نوع المصروف
              </label>
              <select
                id="category"
                name="category"
                defaultValue="بضاعة"
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs text-gray-600">
              <input
                type="checkbox"
                name="hit_cash"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              اخصمها من الخزنة
            </label>
          </div>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white ${
            isPayment
              ? "bg-green-600 hover:bg-green-700"
              : "bg-primary hover:bg-primary-dark"
          }`}
        >
          {isPayment ? "تسجيل الدفعة" : "تسجيل الفاتورة"}
        </button>
      </div>
    </form>
  );
}
