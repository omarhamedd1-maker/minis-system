"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// بند الأوردر على الموبايل — كارت واضح، والتعديل بيفتح جوّه بأيقونات
export function OrderItemCard({
  orderId,
  itemId,
  productName,
  variantName,
  quantity,
  salePrice,
  canEdit,
  updateAction,
  deleteAction,
}: {
  orderId: string;
  itemId: string;
  productName: string;
  variantName: string;
  quantity: number;
  salePrice: number;
  canEdit: boolean;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900">{productName}</div>
          {variantName && variantName !== "—" && (
            <div className="text-[11px] text-gray-400">{variantName}</div>
          )}
          <div className="mt-1 text-xs text-gray-600">
            {quantity} × {formatMoney(salePrice)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-sm font-bold text-gray-900">
            {formatMoney(quantity * salePrice)}
          </span>
          {canEdit && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                title="تعديل"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-600 shadow-sm"
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
                <input type="hidden" name="order_id" value={orderId} />
                <input type="hidden" name="item_id" value={itemId} />
                <button
                  type="submit"
                  title="مسح"
                  onClick={(e) => {
                    if (!confirm("تمسح المنتج ده من الأوردر؟")) e.preventDefault();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-red-600 shadow-sm"
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
      </div>

      {canEdit && editing && (
        <form
          action={async (fd) => {
            await updateAction(fd);
            setEditing(false);
          }}
          className="minis-in mt-2 flex items-end gap-2 border-t border-gray-200 pt-2"
        >
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="item_id" value={itemId} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className="text-[11px] text-gray-500">الكمية</label>
            <input
              type="number"
              name="quantity"
              defaultValue={quantity}
              min={1}
              step={1}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className="text-[11px] text-gray-500">السعر</label>
            <input
              type="number"
              name="sale_price"
              defaultValue={salePrice}
              min={0}
              step="0.01"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            title="حفظ"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}
