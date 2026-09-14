"use client";

import { useState, useTransition } from "react";

/**
 * زرار «جيب الأسباب من بوسطة».
 *
 * ⚠️ **النتيجة بتتعرض بالأرقام مش بـ«تم»** — عمر لازم يعرف إن ١٦ شحنة مثلًا
 * بوسطة نفسها ماسجّلتش سبب عليها، عشان مايفضلش مستني القسم يتملى لوحده.
 */
export function FillReasons({
  action,
}: {
  action: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action();
            setFailed(!r.ok);
            setNote(r.message);
          })
        }
        className="rounded-control bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {pending ? "بنسأل بوسطة…" : "جيب الأسباب من بوسطة"}
      </button>

      {note && (
        <span className={`text-xs ${failed ? "text-danger" : "text-ink-muted"}`}>
          {note}
        </span>
      )}
    </div>
  );
}
