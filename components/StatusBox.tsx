"use client";

import { useState } from "react";

type Option = { value: string; label: string };

// حالة الأوردر: بتبان كشريحة، وبأيقونة قلم تتحوّل لقايمة + أيقونة حفظ
export function StatusBox({
  orderId,
  currentStatus,
  badgeLabel,
  badgeClass,
  returnTo,
  options,
  updateAction,
}: {
  orderId: string;
  currentStatus: string;
  badgeLabel: string;
  badgeClass: string;
  returnTo: string;
  options: Option[];
  updateAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {badgeLabel}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="تعديل الحالة"
          aria-label="تعديل الحالة"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <form action={updateAction} className="flex items-center gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <select
        name="status"
        defaultValue={currentStatus}
        aria-label="حالة الأوردر"
        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        title="حفظ"
        aria-label="حفظ"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-white"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        title="إلغاء"
        aria-label="إلغاء"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-500"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-3.5 w-3.5"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </form>
  );
}
