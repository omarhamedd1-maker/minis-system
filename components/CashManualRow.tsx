"use client";

import { useState } from "react";
import { ConfirmButton } from "./ConfirmButton";
import { formatDate, formatMoney } from "@/lib/format";

type Row = {
  id: string;
  direction: string;
  amount: number;
  description: string | null;
  transaction_date: string | null;
};

export function CashManualRow({
  row,
  updateAction,
  deleteAction,
}: {
  row: Row;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const formId = `cash-${row.id}`;
  const label = row.direction === "in" ? "إيداع يدوي" : "سحب يدوي";

  if (!editing) {
    return (
      <tr className="border-b border-gray-100 last:border-0">
        <td className="px-2 py-3 text-xs text-gray-700 sm:px-4 sm:text-sm">
          {formatDate(row.transaction_date)}
        </td>
        <td className="hidden px-4 py-3 sm:table-cell">
          {row.direction === "in" ? (
            <span className="inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
              داخل
            </span>
          ) : (
            <span className="inline-block rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
              خارج
            </span>
          )}
        </td>
        <td className="break-words px-2 py-3 text-xs text-gray-700 sm:px-4 sm:text-sm">
          {row.description ? `${label}: ${row.description}` : label}
        </td>
        <td
          className={`px-2 py-3 text-xs font-medium sm:px-4 sm:text-sm ${
            row.direction === "in" ? "text-green-700" : "text-red-700"
          }`}
        >
          {formatMoney(row.amount)}
        </td>
        <td className="px-2 py-3 sm:px-4">
          <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-dark sm:px-3"
            >
              تعديل
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="transaction_id" value={row.id} />
              <ConfirmButton
                message="متأكد إنك عايز تمسح الحركة دي من الخزنة؟"
                className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 sm:px-3"
              >
                مسح
              </ConfirmButton>
            </form>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-100 bg-gray-50 last:border-0">
      <td className="px-4 py-3">
        <form id={formId} action={updateAction}>
          <input type="hidden" name="transaction_id" value={row.id} />
        </form>
        <input
          type="date"
          name="transaction_date"
          form={formId}
          defaultValue={(row.transaction_date ?? "").slice(0, 10)}
          required
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </td>
      <td className="px-4 py-3">
        <select
          name="direction"
          form={formId}
          defaultValue={row.direction}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        >
          <option value="in">إيداع</option>
          <option value="out">سحب</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          name="description"
          form={formId}
          defaultValue={row.description ?? ""}
          placeholder="الوصف"
          className="w-full min-w-32 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          name="amount"
          form={formId}
          defaultValue={row.amount}
          min="0.01"
          step="0.01"
          required
          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            form={formId}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark"
          >
            حفظ
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            إلغاء
          </button>
        </div>
      </td>
    </tr>
  );
}
