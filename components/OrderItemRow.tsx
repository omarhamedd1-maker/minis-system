"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// صف بند الأوردر — زرار واحد يتحوّل من "تعديل" لـ "حفظ" زي المصاريف والخزنة
export function OrderItemRow({
  orderId,
  itemId,
  productName,
  variantName,
  quantity,
  salePrice,
  updateAction,
  deleteAction,
}: {
  orderId: string;
  itemId: string;
  productName: string;
  variantName: string;
  quantity: number;
  salePrice: number;
  updateAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const formId = `item-${itemId}`;

  return (
    <tr className={`border-b border-line last:border-0 ${editing ? "bg-warning-soft" : ""}`}>
      <td className="px-2 py-3 text-ink sm:px-4">{productName}</td>
      <td className="hidden px-4 py-3 text-ink-body sm:table-cell">{variantName}</td>

      {editing ? (
        <>
          <td className="px-2 py-3 sm:px-4">
            <form id={formId} action={updateAction}>
              <input type="hidden" name="order_id" value={orderId} />
              <input type="hidden" name="item_id" value={itemId} />
            </form>
            <input
              type="number"
              name="quantity"
              form={formId}
              defaultValue={quantity}
              min={1}
              step={1}
              aria-label="الكمية"
              className="w-16 rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </td>
          <td className="px-2 py-3 sm:px-4">
            <input
              type="number"
              name="sale_price"
              form={formId}
              defaultValue={salePrice}
              min={0}
              step="0.01"
              aria-label="سعر البيع"
              className="w-24 rounded-control border border-line-strong px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </td>
          <td className="px-2 py-3 sm:px-4">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                form={formId}
                className="rounded-control bg-primary px-3 py-1 text-xs font-medium text-white"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-control bg-sunken px-3 py-1 text-xs font-medium text-ink-body"
              >
                إلغاء
              </button>
            </div>
          </td>
        </>
      ) : (
        <>
          <td className="px-2 py-3 text-ink-body sm:px-4">{quantity}</td>
          <td className="px-2 py-3 text-ink-body sm:px-4">{formatMoney(salePrice)}</td>
          <td className="px-2 py-3 sm:px-4">
            <div className="flex items-center gap-2">
              <span className="text-ink-body">
                {formatMoney(quantity * salePrice)}
              </span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-control bg-sunken px-2.5 py-1 text-xs font-medium text-ink-body"
              >
                تعديل
              </button>
              <form action={deleteAction}>
                <input type="hidden" name="order_id" value={orderId} />
                <input type="hidden" name="item_id" value={itemId} />
                <button
                  type="submit"
                  onClick={(e) => {
                    if (!confirm("متأكد إنك عايز تمسح المنتج ده من الأوردر؟"))
                      e.preventDefault();
                  }}
                  className="rounded-control bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger"
                >
                  مسح
                </button>
              </form>
            </div>
          </td>
        </>
      )}
    </tr>
  );
}
