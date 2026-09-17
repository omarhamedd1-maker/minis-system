"use client";

import { useRef } from "react";

/**
 * زرار بشاشة تأكيد بتقول **بالظبط** هيحصل إيه — مش «متأكد؟» عامة.
 *
 * - العنوان والتفاصيل (الوصف · المبلغ · التاريخ) بتتكتب من الصف نفسه.
 * - زرار التأكيد نصه الفعل نفسه («مسح» · «إلغاء الحركة») مش «تأكيد».
 * - **«رجوع» هو الافتراضي** — Enter أو Esc مابينفّذوش حاجة.
 *
 * لازم يكون جوّه `<form>` — التأكيد بيبعت الفورم.
 */
export function ConfirmDialogButton({
  title,
  detail,
  note,
  confirmLabel,
  label,
  className,
  children,
}: {
  title: string;
  /** «إعلان إنستجرام · ٧٥٠ جنيه · ١٤ سبتمبر» */
  detail: string;
  /** سطر صغير تحت — إيه اللي هيحصل بعد كده */
  note?: string;
  confirmLabel: string;
  /** اسم الزرار للقارئ والـtooltip (الزرار أيقونة) */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        title={label}
        aria-label={label}
        className={className}
        onClick={() => dialog.current?.showModal()}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        aria-label={title}
        className="m-auto w-[min(92vw,380px)] rounded-modal border border-line bg-surface p-0 text-start shadow-pop backdrop:bg-ink/40"
        onClick={(e) => {
          // الضغط برّه الشاشة = رجوع
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="p-5">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <p className="mt-2 text-sm text-ink-body">{detail}</p>
          {note && <p className="mt-1.5 text-xs text-ink-muted">{note}</p>}
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
                trigger.current?.form?.requestSubmit();
              }}
              className="rounded-control bg-danger px-4 py-2 text-sm font-medium text-white hover:brightness-[0.92]"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
