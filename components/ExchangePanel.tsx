"use client";

import { useState } from "react";
import { BostaMark } from "./BostaMark";

type Item = {
  id: string;
  name: string;
  quantity: number;
};

/**
 * لوحة التبديل — بنفس شكل لوحة المرتجع بقصد.
 *
 * الفرق إن التبديل رحلة واحدة فيها اتجاهين: بوسطة بتوصّل الجديد وتاخد
 * القديم. فبنسأل سؤالين مش سؤال: **إيه اللي راجع من العميل** و**إيه اللي
 * رايح له** — وفرق السعر لو فيه.
 */
export function ExchangePanel({
  orderId,
  items,
  exchangeTracking,
  exchangeNote,
  shipmentAction,
}: {
  orderId: string;
  items: Item[];
  exchangeTracking: string | null;
  exchangeNote: string | null;
  shipmentAction: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [back, setBack] = useState<Record<string, number>>({});
  const [out, setOut] = useState<Record<string, number>>({});

  const totalBack = Object.values(back).reduce((s, n) => s + n, 0);
  const totalOut = Object.values(out).reduce((s, n) => s + n, 0);

  function bump(
    set: typeof setBack,
    id: string,
    delta: number,
    max: number
  ) {
    set((prev) => ({
      ...prev,
      [id]: Math.min(Math.max((prev[id] ?? 0) + delta, 0), max),
    }));
  }

  // الشحنة اتعملت خلاص
  if (exchangeTracking) {
    return (
      <div className="rounded-card bg-surface p-4 shadow-card">
        <h2 className="mb-2 text-sm font-bold text-ink">التبديل</h2>
        <p className="text-sm text-ink-body">
          شحنة التبديل اتعملت — رقم التتبع{" "}
          <span className="font-medium" dir="ltr">
            {exchangeTracking}
          </span>
        </p>
        {exchangeNote && (
          <p className="mt-1 text-xs text-ink-muted">{exchangeNote}</p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-card bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-sm font-bold text-ink">التبديل</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-control bg-primary px-3 py-2 text-sm font-medium text-white"
        >
          <BostaMark className="h-4 w-4" />
          اعمل شحنة تبديل
        </button>
      </div>
    );
  }

  const column = (
    title: string,
    hint: string,
    state: Record<string, number>,
    set: typeof setBack,
    prefix: string
  ) => (
    <div>
      <div className="mb-1.5 text-xs font-bold text-ink-body">
        {title}
        <span className="block text-[10px] font-normal text-ink-faint">{hint}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((i) => (
          <div
            key={i.id}
            className="flex items-center gap-2 rounded-control bg-sunken px-2.5 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-xs text-ink-body">
              {i.name}
              <span className="text-ink-faint"> (من {i.quantity})</span>
            </span>
            <input
              type="hidden"
              name={`${prefix}_${i.id}`}
              value={state[i.id] ?? 0}
            />
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => bump(set, i.id, -1, i.quantity)}
                aria-label="أقل"
                className="flex h-7 w-7 items-center justify-center rounded-control bg-surface text-ink-muted shadow-card disabled:opacity-40"
                disabled={(state[i.id] ?? 0) <= 0}
              >
                −
              </button>
              <span className="w-7 text-center text-sm font-medium text-ink">
                {state[i.id] ?? 0}
              </span>
              <button
                type="button"
                onClick={() => bump(set, i.id, 1, i.quantity)}
                aria-label="أكتر"
                className="flex h-7 w-7 items-center justify-center rounded-control bg-surface text-ink-muted shadow-card disabled:opacity-40"
                disabled={(state[i.id] ?? 0) >= i.quantity}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="minis-in rounded-card bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">التبديل</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-faint hover:text-ink-body"
        >
          إلغاء
        </button>
      </div>

      <form action={shipmentAction} className="space-y-3">
        <input type="hidden" name="order_id" value={orderId} />

        {column(
          "الراجع من العميل",
          "اللي المندوب هياخده منه",
          back,
          setBack,
          "back"
        )}
        {column(
          "الرايح للعميل",
          "اللي المندوب هيوصّله له",
          out,
          setOut,
          "out"
        )}

        <div>
          <label className="mb-1 block text-xs text-ink-muted">
            فرق السعر اللي المندوب يحصّله
            <span className="block text-[10px] text-ink-faint">
              سيبها صفر لو مفيش فرق — الحاجة القديمة مدفوعة خلاص
            </span>
          </label>
          <input
            name="exchange_cod"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            dir="ltr"
            className="w-full rounded-control border border-line-strong px-2 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={totalBack === 0 || totalOut === 0}
          className="flex w-full items-center justify-center gap-2 rounded-control bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          <BostaMark className="h-4 w-4" />
          اعمل شحنة التبديل ({totalOut} رايح · {totalBack} راجع)
        </button>
        {(totalBack === 0 || totalOut === 0) && (
          <p className="text-[11px] text-ink-faint">
            لازم تحدد الاتنين — رايح وراجع. لو مفيش حاجة رايحة يبقى ده مرتجع
            مش تبديل.
          </p>
        )}
      </form>
    </div>
  );
}
