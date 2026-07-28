"use client";

import { useState } from "react";

// زرار + بسيط — الخانات مابتظهرش غير لما تدوس عليه
export function AddSupplier({
  action,
}: {
  action: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="إضافة مورد"
          aria-label="إضافة مورد"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white transition-transform hover:bg-gray-700 active:scale-90"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-5 w-5"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <form
      action={async (fd) => {
        await action(fd);
        setOpen(false);
      }}
      className="minis-in w-full space-y-2 rounded-xl bg-white p-4 shadow-sm"
    >
      <input
        name="name"
        required
        autoFocus
        placeholder="اسم المورد"
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
      />
      <div className="flex gap-2">
        <input
          name="phone"
          inputMode="tel"
          placeholder="التليفون (اختياري)"
          className="w-36 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
        <input
          name="notes"
          placeholder="ملاحظات (اختياري)"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white"
        >
          حفظ
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
