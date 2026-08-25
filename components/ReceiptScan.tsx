"use client";

import { useRef, useState, useTransition } from "react";
import type { ReadReceipt } from "@/lib/receipt";

type ScanResult =
  | { ok: true; read: ReadReceipt }
  | { ok: false; reason: string };

/**
 * صوّر الإيصال والخانات بتتملي لوحدها.
 *
 * ⚠️⚠️ **بيملّي الفورم اللي تحته، مابيحفظش.** الرقم اللي بيتقرا من صورة
 * بيغلط — الإضاءة وخط الإيصال والفاتورة اللي فيها إجمالي وضريبة وخصم.
 * فالمستخدم بيراجع ويدوس «سجّل» بنفسه زي أي مصروف.
 *
 * ⚠️ **والخانة اللي مابانتش بتفضل فاضية** — الخانة الفاضية بتتملي في
 * ثانية، والرقم الغلط بيدخل الحسابات ومحدش بيلاقيه.
 */
export function ReceiptScan({
  scan,
}: {
  scan: (formData: FormData) => Promise<ScanResult>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * ⚠️ **الملّي بالـDOM بقصد** — الفورم اللي تحت فورم سيرفر عادي بخاناته
   * المسمّاة، ولو حوّلناه لحالة رياكت كان لازم نعيد كتابته كله عشان ميزة
   * مساعدة. المللي بيسيبه زي ما هو.
   */
  function fill(read: ReadReceipt) {
    const set = (id: string, value: string | null) => {
      if (value === null) return;
      const el = document.getElementById(id) as
        | HTMLInputElement
        | HTMLSelectElement
        | null;
      if (!el) return;
      // النوع `select` — والقيمة اللي مش في القايمة مابتتحطش
      if (el instanceof HTMLSelectElement) {
        const has = [...el.options].some((o) => o.value === value);
        if (!has) return;
      }
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

    set("amount", read.amount === null ? null : String(read.amount));
    set("expense_date", read.date);
    set("category", read.category);
    // الوصف: اسم المحل واللي اتشرى
    const desc = [read.vendor, read.note].filter(Boolean).join(" — ");
    set("description", desc || null);
  }

  function onPick(file: File) {
    setFailed(false);
    setNote(null);
    const data = new FormData();
    data.set("image", file);

    start(async () => {
      try {
        const r = await scan(data);
        if (!r.ok) {
          setFailed(true);
          setNote(r.reason);
          return;
        }
        fill(r.read);
        setNote(
          r.read.missing.length === 0
            ? "قرينا كل حاجة — راجعها وأكّد"
            : `${r.read.missing.join(" و")} مابانوش — كمّلهم`
        );
      } catch {
        setFailed(true);
        setNote("القراية نفسها مانفعتش");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        // ⚠️ بيفتح الكاميرا على الموبايل على طول بدل معرض الصور
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-4 w-4"
        >
          <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
          <circle cx="12" cy="12.5" r="3.5" />
        </svg>
        {pending ? "بيقرا…" : "صوّر الإيصال"}
      </button>

      {note && (
        <span
          className={`text-xs ${failed ? "text-red-600" : "text-gray-500"}`}
          dir="auto"
        >
          {note}
        </span>
      )}
    </div>
  );
}
