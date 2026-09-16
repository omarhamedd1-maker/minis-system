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
  supplier,
  showDate = true,
  dateInline = false,
  updateAction,
  deleteAction,
}: {
  expense: Expense;
  /** جوّه مجموعة يوم التاريخ مكتوب في العنوان — مايتكررش في السطر (قرار عمر) */
  showDate?: boolean;
  /** يوم فيه حركة واحدة مالوش عنوان — التاريخ بيتكتب صغير جوّه السطر */
  dateInline?: boolean;
  categories: string[];
  supplier?: string | null;
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
      <tr className="border-b border-line last:border-0">
        {showDate && (
          <td className="whitespace-nowrap px-4 py-3 text-ink-body">
            {formatDate(expense.expense_date)}
          </td>
        )}
        <td className="px-4 py-3 font-medium text-ink">
          {expense.category}
          {dateInline && (
            <div className="text-[11px] font-normal text-ink-faint">
              {formatDate(expense.expense_date)}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-ink-body">
          {expense.description ?? "—"}
          {supplier && (
            <span className="ms-2 rounded-full bg-sunken px-2 py-0.5 text-xs text-ink-muted">
              مورد: {supplier}
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-ink-body">
          {formatMoney(expense.amount)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-control bg-sunken px-3 py-1 text-xs font-medium text-ink-body hover:bg-line"
            >
              تعديل
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="expense_id" value={expense.id} />
              <ConfirmButton
                message="متأكد إنك عايز تمسح المصروف ده؟ هيتشال من الخزنة كمان."
                className="rounded-control bg-danger-soft px-3 py-1 text-xs font-medium text-danger hover:bg-danger-line"
              >
                مسح
              </ConfirmButton>
            </form>
          </div>
        </td>
      </tr>
    );
  }

  // التاريخ لازم يفضل قابل للتعديل — من غير عموده بيتحط فوق النوع
  const dateField = (
    <>
      <form id={formId} action={updateAction}>
        <input type="hidden" name="expense_id" value={expense.id} />
      </form>
      <input
        type="date"
        name="expense_date"
        form={formId}
        defaultValue={expense.expense_date}
        required
        aria-label="التاريخ"
        className="rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
      />
    </>
  );

  return (
    <tr className="border-b border-line bg-warning-soft last:border-0">
      {showDate && <td className="px-4 py-3">{dateField}</td>}
      <td className="px-4 py-3">
        {!showDate && <div className="mb-1.5">{dateField}</div>}
        <input
          name="category"
          form={formId}
          list={`cats-${expense.id}`}
          defaultValue={expense.category}
          required
          autoComplete="off"
          className="w-32 rounded-control border border-line-strong bg-surface px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <datalist id={`cats-${expense.id}`}>
          {catOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </td>
      <td className="px-4 py-3">
        <input
          name="description"
          form={formId}
          defaultValue={expense.description ?? ""}
          className="w-full min-w-32 rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
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
          className="w-28 rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            form={formId}
            className="rounded-control bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark"
          >
            حفظ
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-control bg-sunken px-3 py-1 text-xs font-medium text-ink-body hover:bg-line"
          >
            إلغاء
          </button>
        </div>
      </td>
    </tr>
  );
}
