"use client";

import { useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";

// كارت حركة الخزنة على الموبايل — التعديل بيفتح فوراً من غير تحميل صفحة
export function CashCard({
  id,
  direction,
  amount,
  description,
  transactionDate,
  label,
  canEdit,
  updateAction,
  deleteAction,
}: {
  id: string;
  direction: string;
  amount: number;
  description: string | null;
  transactionDate: string | null;
  label: string;
  canEdit: boolean;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const isIn = direction === "in";

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm transition-colors active:bg-gray-50">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900">{label}</div>
          <div className="mt-0.5 text-[11px] text-gray-400">
            {formatDate(transactionDate)}
          </div>
        </div>

        <div
          className={`shrink-0 text-base font-bold ${
            isIn ? "text-green-700" : "text-red-700"
          }`}
        >
          {isIn ? "+" : "−"} {formatMoney(amount)}
        </div>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              title="تعديل"
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
            <form action={deleteAction}>
              <input type="hidden" name="transaction_id" value={id} />
              <button
                type="submit"
                title="مسح"
                onClick={(e) => {
                  if (!confirm("متأكد إنك عايز تمسح الحركة دي من الخزنة؟"))
                    e.preventDefault();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600"
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
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>

      {canEdit && editing && (
        <form
          action={async (fd) => {
            await updateAction(fd);
            setEditing(false);
          }}
          className="minis-in mt-2 space-y-2 border-t border-gray-100 pt-2"
        >
          <input type="hidden" name="transaction_id" value={id} />
          <div className="flex gap-2">
            <select
              name="direction"
              defaultValue={direction}
              className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              aria-label="النوع"
            >
              <option value="in">إيداع</option>
              <option value="out">سحب</option>
            </select>
            <input
              type="number"
              name="amount"
              defaultValue={amount}
              min="0.01"
              step="0.01"
              className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              aria-label="المبلغ"
            />
          </div>
          <input
            name="description"
            defaultValue={description ?? ""}
            placeholder="الوصف"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              name="transaction_date"
              defaultValue={(transactionDate ?? "").slice(0, 10)}
              className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              aria-label="التاريخ"
            />
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white"
            >
              حفظ
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
