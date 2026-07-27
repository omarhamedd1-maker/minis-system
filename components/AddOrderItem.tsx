"use client";

import { useState } from "react";

type Variant = {
  id: string;
  sku: string | null;
  name_en: string | null;
  name_ar: string | null;
  variant_name: string | null;
  sale_price: number;
};

export function AddOrderItem({
  orderId,
  variants,
  addAction,
}: {
  orderId: string;
  variants: Variant[];
  addAction: (formData: FormData) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Variant | null>(null);
  const [price, setPrice] = useState("");
  const [open, setOpen] = useState(false);

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const q = query.trim();
  const filtered = q
    ? variants.filter(
        (v) =>
          norm(v.name_ar ?? "").includes(norm(q)) ||
          norm(v.name_en ?? "").includes(norm(q)) ||
          (v.sku ?? "").toLowerCase().includes(q.toLowerCase())
      )
    : variants;

  const label = (v: Variant) =>
    [v.sku ?? "—", v.name_en ?? "—", v.name_ar ?? "—"].join(" - ") +
    (v.variant_name ? ` (${v.variant_name})` : "");

  function pick(v: Variant) {
    setSelected(v);
    setPrice(String(v.sale_price ?? ""));
    setQuery(label(v));
    setOpen(false);
  }

  return (
    <form
      action={addAction}
      className="space-y-2 border-t border-gray-200 px-4 py-4"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="variant_id" value={selected?.id ?? ""} />

      {/* البحث سطر لوحده بعرض كامل */}
      <div className="relative flex flex-col gap-1">
        <label className="text-xs text-gray-500">إضافة منتج</label>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="دور بالكود أو الاسم (عربي/إنجليزي)"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            ></div>
            <div className="absolute bottom-full z-20 mb-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-gray-400">
                  مفيش نتايج
                </p>
              ) : (
                filtered.slice(0, 60).map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => pick(v)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-gray-50"
                  >
                    <span
                      className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                      dir="ltr"
                    >
                      {v.sku ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
                      {v.name_ar ?? v.name_en ?? "—"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* المنتج المختار ظاهر واضح */}
      {selected && (
        <div className="minis-in flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs">
          <span
            className="shrink-0 rounded bg-white px-1.5 py-0.5 text-gray-600"
            dir="ltr"
          >
            {selected.sku ?? "—"}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
            {selected.name_ar ?? selected.name_en ?? "—"}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
              setPrice("");
            }}
            title="شيل الاختيار"
            className="shrink-0 rounded-lg px-1.5 text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* الكمية والسعر والإضافة في سطر واحد */}
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label className="text-xs text-gray-500">الكمية</label>
          <input
            type="number"
            name="quantity"
            defaultValue={1}
            min={1}
            step={1}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label className="text-xs text-gray-500">السعر</label>
          <input
            type="number"
            name="sale_price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min={0}
            step="0.01"
            placeholder="سعر البيع"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!selected}
          className="shrink-0 rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
        >
          إضافة
        </button>
      </div>
    </form>
  );
}
