"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// زرار + جنب العنوان — بيفتح نافذة صغيرة فيها خانات المورد
export function AddSupplier({
  action,
}: {
  action: (fd: FormData) => Promise<void>;
}) {
  // مفيش داعي لحالة "اتحمّل" — النافذة مابتتفتحش غير بضغطة من المتصفح،
  // يعني وقت العرض من السيرفر بتبقى مقفولة ومفيش وصول للصفحة أصلاً
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="إضافة مورد"
        aria-label="إضافة مورد"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white transition-transform hover:bg-primary-dark active:scale-90"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          className="h-4 w-4"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div className="absolute inset-0 bg-black/30" />
            <form
              action={async (fd) => {
                await action(fd);
                setOpen(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="minis-in relative w-full max-w-md space-y-2 rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-4"
            >
              <h2 className="text-sm font-bold text-gray-900">مورد جديد</h2>
              <input
                name="name"
                required
                autoFocus
                placeholder="اسم المورد"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
              <input
                name="phone"
                inputMode="tel"
                placeholder="التليفون (اختياري)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
              <input
                name="notes"
                placeholder="ملاحظات (اختياري)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </>
  );
}
