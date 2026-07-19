"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";

type Row = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  ordersCount: number;
  total: number;
  lastOrderDate: string | null;
};

export function CustomerRow({
  row,
  isAdmin,
  updateAction,
  deleteAction,
}: {
  row: Row;
  isAdmin: boolean;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const formId = `customer-${row.id}`;

  if (isAdmin && editing) {
    return (
      <tr className="border-b border-gray-100 bg-yellow-50 last:border-0">
        <td className="px-4 py-3">
          <form id={formId} action={updateAction}>
            <input type="hidden" name="customer_id" value={row.id} />
          </form>
          <input
            name="full_name"
            form={formId}
            defaultValue={row.name}
            required
            className="w-32 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <input
            name="phone"
            form={formId}
            defaultValue={row.phone ?? ""}
            dir="ltr"
            className="w-32 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3">
          <input
            name="address"
            form={formId}
            defaultValue={row.address ?? ""}
            className="w-full min-w-40 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </td>
        <td className="px-4 py-3 text-gray-700">{row.ordersCount}</td>
        <td className="px-4 py-3 font-medium text-gray-900">
          {formatMoney(row.total)}
        </td>
        <td className="px-4 py-3 text-gray-700">
          {formatDate(row.lastOrderDate)}
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

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
      <td className="px-4 py-3 text-gray-700" dir="ltr">
        {row.phone ?? "—"}
      </td>
      <td className="max-w-48 truncate px-4 py-3 text-gray-700">
        {row.address ?? "—"}
      </td>
      <td className="px-4 py-3 text-gray-700">{row.ordersCount}</td>
      <td className="px-4 py-3 font-medium text-gray-900">
        {formatMoney(row.total)}
      </td>
      <td className="px-4 py-3 text-gray-700">{formatDate(row.lastOrderDate)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/customers/${row.id}`}
            className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
          >
            صفحته
          </Link>
          <Link
            href={`/orders?q=${encodeURIComponent(row.phone ?? row.name)}`}
            className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            أوردراته
          </Link>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              تعديل
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
