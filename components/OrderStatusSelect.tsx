"use client";

import { useRef } from "react";

type Option = { value: string; label: string };

export function OrderStatusSelect({
  orderId,
  currentStatus,
  returnTo,
  options,
  updateAction,
}: {
  orderId: string;
  currentStatus: string;
  returnTo: string;
  options: Option[];
  updateAction: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <select
        name="status"
        defaultValue={currentStatus}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
        aria-label="حالة الأوردر"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </form>
  );
}
