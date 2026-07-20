"use client";

import { useState } from "react";

export type PickerVariant = {
  id: string;
  sku: string | null;
  name_en: string | null;
  name_ar: string | null;
  variant_name: string | null;
  sale_price: number;
};

export function ProductPicker({
  name,
  variants,
  placeholder = "دور بالكود أو الاسم",
}: {
  name: string;
  variants: PickerVariant[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
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

  const label = (v: PickerVariant) =>
    [v.sku ?? "—", v.name_en ?? "—", v.name_ar ?? "—"].join(" - ") +
    (v.variant_name ? ` (${v.variant_name})` : "");

  function pick(v: PickerVariant) {
    setSelectedId(v.id);
    setQuery(label(v));
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId} />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
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
                  <span className="text-gray-500" dir="ltr">
                    {v.name_en ?? "—"}
                  </span>
                  <span className="font-medium text-gray-900">
                    {v.name_ar ?? "—"}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
