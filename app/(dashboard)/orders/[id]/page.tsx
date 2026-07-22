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
import { AutoRefresh } from "@/components/AutoRefresh";
import { OrderStatusSelect } from "@/components/OrderStatusSelect";
import { DiscountBox } from "@/components/DiscountBox";
import { AddOrderItem } from "@/components/AddOrderItem";
import { can, requirePagePermission } from "@/lib/permissions";
import {
  addOrderItem,
  deleteOrder,
  deleteOrderItem,
  linkBostaShipment,
  sendOrderToBosta,
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
  bosta_tracking: string | null;
  bosta_shipping_cost: number;
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
  const user = await requirePagePermission("orders.view");
  const canItems = can(user, "orders.items");
  const canStatus = can(user, "orders.status");
  const canArchive = can(user, "orders.archive");
  const canDelete = can(user, "orders.delete");
  const canLink = can(user, "ship.link");
  const canSend = can(user, "ship.send");
  const canPrint = can(user, "ship.print");
  const isAdmin = user.isAdmin;
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_status, order_date, archived, shipping_price, discount,
       bosta_state, bosta_cod, bosta_collected, bosta_tracking, bosta_shipping_cost,
       customers(full_name, phone, address),
       order_items(id, quantity, sale_price_at_order, cost_price_at_order,
         product_variants(variant_name, products(name)))`
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

  // قايمة المنتجات لفورم إضافة منتج (لمن يقدر يعدّل البنود)
  const { data: variantsData } = canItems
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

  // الأوردر السابق (الأحدث) والتالي (الأقدم) بترتيب التاريخ زي القايمة
  const [{ data: prevOrder }, { data: nextOrder }] = order.order_date
    ? await Promise.all([
        supabase
          .from("orders")
          .select("id")
          .gt("order_date", order.order_date)
          .order("order_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id")
          .lt("order_date", order.order_date)
          .order("order_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  // لينك واتساب العميل: نحوّل الرقم لصيغة دولية (مصر 20)
  const rawPhone = (order.customers?.phone ?? "").replace(/\D/g, "");
  const intlPhone = rawPhone
    ? rawPhone.startsWith("20")
      ? rawPhone
      : "20" + rawPhone.replace(/^0+/, "")
    : null;
  const whatsappLink = intlPhone ? `https://wa.me/${intlPhone}` : null;

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
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
        <div className="flex items-center gap-2">
          {prevOrder ? (
            <Link
              href={`/orders/${prevOrder.id}`}
              title="الأوردر السابق"
              className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              ← السابق
            </Link>
          ) : (
            <span className="rounded-lg bg-gray-50 px-3 py-1 text-sm text-gray-300">
              ← السابق
            </span>
          )}
          {nextOrder ? (
            <Link
              href={`/orders/${nextOrder.id}`}
              title="الأوردر التالي"
              className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              التالي →
            </Link>
          ) : (
            <span className="rounded-lg bg-gray-50 px-3 py-1 text-sm text-gray-300">
              التالي →
            </span>
          )}
          <Link
            href="/orders"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            الرجوع للأوردرات
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {saved === "1" ? "تم حفظ الحالة الجديدة" : saved}
        </div>
      )}

      {canStatus && (
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
              <dd className="flex items-center gap-2 text-gray-900" dir="ltr">
                {order.customers?.phone ?? "—"}
                {whatsappLink && (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-100"
                  >
                    واتساب
                  </a>
                )}
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

          {order.bosta_state ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">حالة بوسطة</dt>
                <dd className="text-gray-900" dir="ltr">
                  {order.bosta_state}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">رقم التتبع (بوسطة)</dt>
                <dd className="text-gray-900" dir="ltr">
                  {order.bosta_tracking ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">الدفع عند الاستلام (COD)</dt>
                <dd className="text-gray-900">{formatMoney(order.bosta_cod)}</dd>
              </div>
              {order.bosta_shipping_cost > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-gray-500">إجمالي تكلفة الشحن</dt>
                  <dd className="text-left text-gray-900">
                    {formatMoney(90 + order.bosta_shipping_cost)}
                    <span className="block text-xs text-gray-400">
                      90 + {formatMoney(order.bosta_shipping_cost)} رسوم بوسطة
                    </span>
                  </dd>
                </div>
              )}
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
              {order.bosta_tracking && canPrint && (
                <a
                  href={`/orders/${order.id}/awb`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                  </svg>
                  اطبع البوليصة
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">لسه مفيش شحنة للأوردر ده.</p>
          )}

          {/* إرسال الأوردر لبوسطة كشحنة (لو لسه مفيش شحنة) */}
          {!order.bosta_tracking && canSend && (
            <form
              action={sendOrderToBosta}
              className="mt-3 border-t border-gray-100 pt-3"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <ConfirmButton
                message={`متأكد إنك عايز تبعت أوردر ${order.order_number ?? ""} لبوسطة كشحنة؟`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#E30613] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#b7050f]"
              >
                📦 ابعت لبوسطة كشحنة
              </ConfirmButton>
              <p className="mt-1 text-xs text-gray-400">
                هنعمل الشحنة في بوسطة تلقائياً ونجيب رقم التتبع. لو معرفناش نحدد
                المدينة من العنوان هنوقف ونقوللك تراجعه.
              </p>
            </form>
          )}

          {canLink && (
            <form
              action={linkBostaShipment}
              className="mt-3 border-t border-gray-100 pt-3"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <label className="text-xs text-gray-500">
                ربط شحنة يدوي (لإعادة استخدام شحنة عميل لغى)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  name="tracking"
                  placeholder="رقم التتبع بتاع بوسطة"
                  dir="ltr"
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                >
                  ربط
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                هيربط الشحنة دي بالأوردر، والمزامنة تجيب باقي التفاصيل تلقائياً
              </p>
            </form>
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
                {canItems ? (
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
                        key={`qty-${item.quantity}`}
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
                        key={`price-${item.sale_price_at_order}`}
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
                  {canItems && (
                    <form
                      action={updateShippingPrice}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="order_id" value={order.id} />
                      <input
                        key={`ship-${order.shipping_price}`}
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
                  {canItems && (
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

        {canItems && (
          <AddOrderItem
            orderId={order.id}
            variants={variants}
            addAction={addOrderItem}
          />
        )}
      </div>

      {(canArchive || canDelete) && (
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
          {canArchive && (
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
          )}
          {canDelete && (
            <form action={deleteOrder}>
              <input type="hidden" name="order_id" value={order.id} />
              <ConfirmButton
                message={
                  isAdmin
                    ? `متأكد إنك عايز تمسح أوردر ${order.order_number ?? ""} نهائياً؟ هيتمسح ببنوده وشحناته، والمخزون هيرجع زي ما كان.`
                    : `هتبعت طلب حذف لأوردر ${order.order_number ?? ""} للأدمن يوافق عليه. تمام؟`
                }
                className="rounded-lg bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                {isAdmin ? "مسح الأوردر نهائياً" : "اطلب حذف الأوردر"}
              </ConfirmButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
