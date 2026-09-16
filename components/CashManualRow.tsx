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
  balanceAfter,
  showDate = true,
  updateAction,
  deleteAction,
}: {
  row: Row;
  /** الرصيد بعد الحركة — عمود لوحده */
  balanceAfter?: number;
  /** جوّه مجموعة يوم التاريخ مكتوب في العنوان — مايتكررش في السطر (قرار عمر) */
  showDate?: boolean;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const formId = `cash-${row.id}`;
  const label = row.direction === "in" ? "إيداع يدوي" : "سحب يدوي";

  if (!editing) {
    return (
      <tr className="border-b border-line last:border-0">
        {showDate && (
          <td className="px-2 py-3 text-xs text-ink-body sm:px-4 sm:text-sm">
            {formatDate(row.transaction_date)}
          </td>
        )}
        <td className="hidden px-4 py-3 sm:table-cell">
          {row.direction === "in" ? (
            <span className="inline-block rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
              داخل
            </span>
          ) : (
            <span className="inline-block rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">
              خارج
            </span>
          )}
        </td>
        <td className="break-words px-2 py-3 text-xs text-ink-body sm:px-4 sm:text-sm">
          {row.description ? `${label}: ${row.description}` : label}
        </td>
        <td
          className={`px-2 py-3 text-xs font-medium sm:px-4 sm:text-sm ${
            row.direction === "in" ? "text-success" : "text-danger"
          }`}
        >
          {formatMoney(row.amount)}
        </td>
        {balanceAfter !== undefined && (
          <td className="px-2 py-3 text-xs tabular-nums text-ink-muted sm:px-4 sm:text-sm">
            {formatMoney(balanceAfter)}
          </td>
        )}
        <td className="px-2 py-3 sm:px-4">
          <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-control bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-dark sm:px-3"
            >
              تعديل
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="transaction_id" value={row.id} />
              <ConfirmButton
                message="متأكد إنك عايز تمسح الحركة دي من الخزنة؟"
                className="rounded-control bg-danger-soft px-2 py-1 text-xs font-medium text-danger hover:bg-danger-line sm:px-3"
              >
                مسح
              </ConfirmButton>
            </form>
          </div>
        </td>
      </tr>
    );
  }

  // التاريخ لازم يفضل قابل للتعديل — من غير عموده بيتحط فوق الاتجاه
  const dateField = (
    <>
      <form id={formId} action={updateAction}>
        <input type="hidden" name="transaction_id" value={row.id} />
      </form>
      <input
        type="date"
        name="transaction_date"
        form={formId}
        defaultValue={(row.transaction_date ?? "").slice(0, 10)}
        required
        aria-label="التاريخ"
        className="rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
      />
    </>
  );

  return (
    <tr className="border-b border-line bg-sunken last:border-0">
      {showDate && <td className="px-4 py-3">{dateField}</td>}
      <td className="px-4 py-3">
        {!showDate && <div className="mb-1.5">{dateField}</div>}
        <select
          name="direction"
          form={formId}
          defaultValue={row.direction}
          className="rounded-control border border-line-strong bg-surface px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
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
          className="w-full min-w-32 rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
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
          className="w-28 rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </td>
      {/* الرصيد بيتحسب بعد الحفظ — الخانة فاضية عشان الأعمدة ماتتزحزحش */}
      {balanceAfter !== undefined && <td className="px-4 py-3"></td>}
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
