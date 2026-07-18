import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ORDER_STATUS_OPTIONS,
  formatDate,
  formatMoney,
  orderStatusBadge,
} from "@/lib/format";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  deleteOrder,
  toggleOrderArchive,
  updateOrderStatus,
} from "./actions";

type OrderDetails = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  archived: boolean;
  customers: {
    full_name: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  order_items: {
    id: string;
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
    product_variants: {
      variant_name: string | null;
      products: { name: string | null } | null;
    } | null;
  }[];
  shipments: {
    id: string;
    bosta_tracking_number: string | null;
    shipping_status: string | null;
    shipping_cost: number | null;
    last_update: string | null;
  }[];
};

export default async function OrderDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error: actionError, saved } = await searchParams;
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_status, order_date, archived,
       customers(full_name, phone, address),
       order_items(id, quantity, sale_price_at_order, cost_price_at_order,
         product_variants(variant_name, products(name))),
       shipments(id, bosta_tracking_number, shipping_status, shipping_cost, last_update)`
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<OrderDetails>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل الأوردر: {error.message}
      </div>
    );
  }

  if (!order) {
    notFound();
  }

  const badge = orderStatusBadge(order.order_status);
  const itemsTotal = order.order_items.reduce(
    (sum, item) => sum + item.quantity * item.sale_price_at_order,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">
            أوردر {order.order_number ?? "بدون رقم"}
          </h1>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {order.archived && (
            <span className="inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              مؤرشف
            </span>
          )}
        </div>
        <Link
          href="/orders"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          الرجوع للأوردرات
        </Link>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم حفظ الحالة الجديدة
        </div>
      )}

      {isAdmin && (
        <form
          action={updateOrderStatus}
          className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm"
        >
          <input type="hidden" name="order_id" value={order.id} />
          <label htmlFor="status" className="text-sm font-medium text-gray-700">
            تغيير حالة الأوردر
          </label>
          <select
            id="status"
            name="status"
            defaultValue={order.order_status ?? "new"}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          >
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            حفظ
          </button>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">بيانات العميل</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">الاسم</dt>
              <dd className="text-gray-900">
                {order.customers?.full_name ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">التليفون</dt>
              <dd className="text-gray-900" dir="ltr">
                {order.customers?.phone ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">العنوان</dt>
              <dd className="text-left text-gray-900">
                {order.customers?.address ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">تاريخ الأوردر</dt>
              <dd className="text-gray-900">{formatDate(order.order_date)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">الشحن</h2>
          {order.shipments.length === 0 ? (
            <p className="text-sm text-gray-500">لسه مفيش شحنة للأوردر ده.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              {order.shipments.map((shipment) => (
                <div key={shipment.id} className="space-y-2">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">رقم التتبع (بوسطة)</dt>
                    <dd className="text-gray-900" dir="ltr">
                      {shipment.bosta_tracking_number ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">حالة الشحن</dt>
                    <dd className="text-gray-900">
                      {shipment.shipping_status ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">تكلفة الشحن</dt>
                    <dd className="text-gray-900">
                      {shipment.shipping_cost != null
                        ? formatMoney(shipment.shipping_cost)
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">آخر تحديث</dt>
                    <dd className="text-gray-900">
                      {formatDate(shipment.last_update)}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
          بنود الأوردر
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right text-gray-500">
              <th className="px-4 py-3 font-medium">المنتج</th>
              <th className="px-4 py-3 font-medium">الشكل</th>
              <th className="px-4 py-3 font-medium">الكمية</th>
              <th className="px-4 py-3 font-medium">سعر البيع</th>
              <th className="px-4 py-3 font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {order.order_items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="px-4 py-3 text-gray-900">
                  {item.product_variants?.products?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {item.product_variants?.variant_name ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-700">{item.quantity}</td>
                <td className="px-4 py-3 text-gray-700">
                  {formatMoney(item.sale_price_at_order)}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {formatMoney(item.quantity * item.sale_price_at_order)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 font-bold text-gray-900">
              <td className="px-4 py-3" colSpan={4}>
                إجمالي الأوردر
              </td>
              <td className="px-4 py-3">{formatMoney(itemsTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
          <form action={toggleOrderArchive}>
            <input type="hidden" name="order_id" value={order.id} />
            <input
              type="hidden"
              name="archive"
              value={order.archived ? "0" : "1"}
            />
            <button
              type="submit"
              className="rounded-lg bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
            >
              {order.archived ? "رجّع من الأرشيف" : "أرشفة الأوردر"}
            </button>
          </form>
          <form action={deleteOrder}>
            <input type="hidden" name="order_id" value={order.id} />
            <ConfirmButton
              message={`متأكد إنك عايز تمسح أوردر ${order.order_number ?? ""} نهائياً؟ هيتمسح ببنوده وشحناته، والمخزون هيرجع زي ما كان.`}
              className="rounded-lg bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              مسح الأوردر نهائياً
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}
