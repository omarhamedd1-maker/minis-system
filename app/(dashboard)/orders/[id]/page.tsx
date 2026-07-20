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
import { OrderStatusSelect } from "@/components/OrderStatusSelect";
import { DiscountBox } from "@/components/DiscountBox";
import { AddOrderItem } from "@/components/AddOrderItem";
import {
  addOrderItem,
  deleteOrder,
  deleteOrderItem,
  toggleOrderArchive,
  updateDiscount,
  updateOrderItem,
  updateOrderStatus,
  updateShippingPrice,
} from "./actions";

type OrderDetails = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  archived: boolean;
  shipping_price: number;
  discount: number;
  bosta_state: string | null;
  bosta_cod: number;
  bosta_collected: boolean;
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
      `id, order_number, order_status, order_date, archived, shipping_price, discount,
       bosta_state, bosta_cod, bosta_collected,
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

  // قايمة المنتجات لفورم إضافة منتج (للأدمن)
  const { data: variantsData } = isAdmin
    ? await supabase
        .from("product_variants")
        .select("id, variant_name, sku, sale_price, products(name, name_ar)")
        .overrideTypes<
          {
            id: string;
            variant_name: string | null;
            sku: string | null;
            sale_price: number;
            products: { name: string | null; name_ar: string | null } | null;
          }[]
        >()
    : { data: [] };
  const variants = (variantsData ?? [])
    .map((v) => ({
      id: v.id,
      sku: v.sku,
      name_en: v.products?.name ?? null,
      name_ar: v.products?.name_ar ?? null,
      variant_name: v.variant_name,
      sale_price: v.sale_price,
    }))
    .sort((a, b) =>
      (a.name_ar ?? a.name_en ?? "").localeCompare(
        b.name_ar ?? b.name_en ?? "",
        "ar"
      )
    );

  if (!order) {
    notFound();
  }

  const badge = orderStatusBadge(order.order_status);
  const itemsTotal = order.order_items.reduce(
    (sum, item) => sum + item.quantity * item.sale_price_at_order,
    0
  );
  const grandTotal = itemsTotal - order.discount + order.shipping_price;

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

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        <span className="text-sm font-medium text-gray-700">
          تغيير حالة الأوردر
        </span>
        <OrderStatusSelect
          orderId={order.id}
          currentStatus={order.order_status ?? "new"}
          returnTo={`/orders/${order.id}`}
          options={ORDER_STATUS_OPTIONS}
          updateAction={updateOrderStatus}
          confirmMessage={
            order.bosta_state &&
            ["shipped", "delivered", "returned"].includes(
              order.order_status ?? ""
            )
              ? "الأوردر ده مع شركة الشحن وحالته بتتحدث من بوسطة تلقائياً. متأكد إنك عايز تغيّرها يدوياً؟"
              : undefined
          }
        />
      </div>

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

          {order.bosta_state && (
            <div className="mb-3 space-y-2 border-b border-gray-100 pb-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">حالة بوسطة</dt>
                <dd className="text-gray-900" dir="ltr">
                  {order.bosta_state}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">الدفع عند الاستلام (COD)</dt>
                <dd className="text-gray-900">{formatMoney(order.bosta_cod)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">حالة التحصيل</dt>
                <dd>
                  {order.bosta_collected ? (
                    <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      اتحصّل من العميل
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      لسه ما اتحصّلش
                    </span>
                  )}
                </dd>
              </div>
            </div>
          )}

          {order.shipments.length === 0 ? (
            <p className="text-sm text-gray-500">
              {order.bosta_state ? "" : "لسه مفيش شحنة للأوردر ده."}
            </p>
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
                {isAdmin ? (
                  <>
                    <td className="px-4 py-3">
                      <form
                        id={`item-${item.id}`}
                        action={updateOrderItem}
                      >
                        <input type="hidden" name="order_id" value={order.id} />
                        <input type="hidden" name="item_id" value={item.id} />
                      </form>
                      <input
                        type="number"
                        name="quantity"
                        form={`item-${item.id}`}
                        defaultValue={item.quantity}
                        min={1}
                        step={1}
                        className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                        aria-label="الكمية"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        name="sale_price"
                        form={`item-${item.id}`}
                        defaultValue={item.sale_price_at_order}
                        min={0}
                        step="0.01"
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                        aria-label="سعر البيع"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">
                          {formatMoney(item.quantity * item.sale_price_at_order)}
                        </span>
                        <button
                          type="submit"
                          form={`item-${item.id}`}
                          className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        >
                          حفظ
                        </button>
                        <form action={deleteOrderItem}>
                          <input type="hidden" name="order_id" value={order.id} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <ConfirmButton
                            message="متأكد إنك عايز تمسح المنتج ده من الأوردر؟"
                            className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            مسح
                          </ConfirmButton>
                        </form>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-gray-700">{item.quantity}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(item.sale_price_at_order)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(item.quantity * item.sale_price_at_order)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 text-gray-700">
              <td className="px-4 py-2" colSpan={4}>
                إجمالي المنتجات
              </td>
              <td className="px-4 py-2">{formatMoney(itemsTotal)}</td>
            </tr>
            <tr className="text-gray-700">
              <td className="px-4 py-2" colSpan={4}>
                <div className="flex items-center gap-3">
                  <span>الشحن (مدفوع من العميل)</span>
                  {isAdmin && (
                    <form
                      action={updateShippingPrice}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="order_id" value={order.id} />
                      <input
                        type="number"
                        name="shipping_price"
                        defaultValue={order.shipping_price}
                        min={0}
                        step="0.01"
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                        aria-label="سعر الشحن"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        حفظ
                      </button>
                    </form>
                  )}
                </div>
              </td>
              <td className="px-4 py-2">{formatMoney(order.shipping_price)}</td>
            </tr>
            <tr className="text-gray-700">
              <td className="px-4 py-2" colSpan={4}>
                <div className="flex flex-wrap items-center gap-3">
                  <span>الخصم</span>
                  {isAdmin && (
                    <DiscountBox
                      orderId={order.id}
                      itemsTotal={itemsTotal}
                      currentDiscount={order.discount}
                      updateAction={updateDiscount}
                    />
                  )}
                </div>
              </td>
              <td className="px-4 py-2 text-red-600">
                {order.discount > 0 ? `- ${formatMoney(order.discount)}` : "—"}
              </td>
            </tr>
            <tr className="border-t border-gray-200 font-bold text-gray-900">
              <td className="px-4 py-3" colSpan={4}>
                إجمالي الأوردر
              </td>
              <td className="px-4 py-3">{formatMoney(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {isAdmin && (
          <AddOrderItem
            orderId={order.id}
            variants={variants}
            addAction={addOrderItem}
          />
        )}
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
