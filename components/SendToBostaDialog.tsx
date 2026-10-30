"use client";

import { useEffect, useRef, useState } from "react";

/**
 * شاشة تأكيد الإرسال لبوسطة — ومعاها قرار «الفتح قبل الدفع».
 *
 * ⚠️ **ليه شاشة مش `confirm()`؟** لأن `confirm()` بتسأل سؤال واحد بس،
 * والقرار هنا اتنين: تبعت؟ ومسموح يفتح؟ وعمر طلب إن **الخانة تبقى
 * متعلّمة** وهو يشيلها لو عايز — يعني الافتراضي يعدّي بدوسة واحدة.
 *
 * وبتتستخدم من مكانين بنفس الشكل: زرار الكرت في القايمة، وشريط التحديد.
 */
export function SendToBostaDialog({
  open,
  title,
  detail,
  defaultAllowOpen = true,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  /** «أوردر ١٥٨١ · ٦٣٠ جنيه» أو «٣ أوردرات» */
  detail: string;
  defaultAllowOpen?: boolean;
  onCancel: () => void;
  onConfirm: (allowOpen: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [allowOpen, setAllowOpen] = useState(defaultAllowOpen);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      // كل فتحة بترجع للافتراضي — القرار بتاع الأوردر ده مش اللي قبله
      setAllowOpen(defaultAllowOpen);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open, defaultAllowOpen]);

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      className="m-auto w-[min(92vw,380px)] rounded-modal border border-line bg-surface p-0 text-start shadow-pop backdrop:bg-ink/40"
      onClose={onCancel}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="p-5">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-ink-body">{detail}</p>

        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-control bg-sunken px-3 py-2.5 text-sm text-ink-body">
          <input
            type="checkbox"
            checked={allowOpen}
            onChange={(e) => setAllowOpen(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            العميل يفتح الطرد قبل ما يدفع
            <span className="mt-0.5 block text-[11px] text-ink-faint">
              بوسطة بتطلب صورة المنتج مع الفتح — بناخدها لوحدنا من شوبيفاي.
              ولو المنتج ملوش صورة، الشحنة بتمشي من غير فتح.
            </span>
          </span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
            className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-body hover:bg-sunken"
          >
            رجوع
          </button>
          <button
            type="button"
            onClick={() => {
              dialog.current?.close();
              onConfirm(allowOpen);
            }}
            className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:brightness-[0.92]"
          >
            ابعت لبوسطة
          </button>
        </div>
      </div>
    </dialog>
  );
}
