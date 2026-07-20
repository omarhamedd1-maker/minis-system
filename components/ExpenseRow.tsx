"use client";

import { useState } from "react";
import { ConfirmButton } from "./ConfirmButton";
import { formatDate, formatMoney } from "@/lib/format";

type Expense = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
};

export function ExpenseRow({
  expense,
  categories,
  updateAction,
  deleteAction,
}: {
  expense: Expense;
  categories: string[];
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const formId = `expense-${expense.id}`;
  const catOptions = categories.includes(expense.category)
    ? categories
    : [expense.category, ...categories];

  if (!editing) {
    return (
      <tr className="border-b border-gray-100 last:border-0">
        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
          {formatDate(expense.expense_date)}
        </td>
        <td className="px-4 py-3 font-medium text-gray-900">
          {expense.category}
        </td>
        <td className="px-4 py-3 text-gray-700">
          {expense.description ?? "—"}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
          {formatMoney(expense.amount)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              تعديل
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="expense_id" value={expense.id} />
              <ConfirmButton
                message="متأكد إنك عايز تمسح المصروف ده؟ هيتشال من الخزنة كمان."
                className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
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
    <tr className="border-b border-gray-100 bg-yellow-50 last:border-0">
      <td className="px-4 py-3">
        <form id={formId} action={updateAction}>
          <input type="hidden" name="expense_id" value={expense.id} />
        </form>
        <input
          type="date"
          name="expense_date"
          form={formId}
          defaultValue={expense.expense_date}
          required
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </td>
      <td className="px-4 py-3">
        <select
          name="category"
          form={formId}
          defaultValue={expense.category}
          required
          className="w-32 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        >
          {catOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          name="description"
          form={formId}
          defaultValue={expense.description ?? ""}
          className="w-full min-w-32 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          name="amount"
          form={formId}
          defaultValue={expense.amount}
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
            className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
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
