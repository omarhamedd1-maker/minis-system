"use client";

import { useState } from "react";

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
};

export function CustomerEdit({
  customer,
  updateAction,
}: {
  customer: Customer;
  updateAction: (formData: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <dl className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">التليفون</dt>
              <dd className="text-gray-900" dir="ltr">
                {customer.phone ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">العنوان</dt>
              <dd className="text-left text-gray-900">
                {customer.address ?? "—"}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ms-4 shrink-0 rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            تعديل
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={updateAction}
      className="rounded-xl bg-yellow-50 p-5 shadow-sm"
    >
      <input type="hidden" name="customer_id" value={customer.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">الاسم</label>
          <input
            name="full_name"
            defaultValue={customer.full_name ?? ""}
            required
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">التليفون</label>
          <input
            name="phone"
            defaultValue={customer.phone ?? ""}
            dir="ltr"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">العنوان</label>
          <input
            name="address"
            defaultValue={customer.address ?? ""}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          حفظ
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
