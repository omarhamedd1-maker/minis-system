import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_BUNDLE,
  bundlePerOrder,
  ORDER_STATUS_OPTIONS,
  PAYMENT_METHODS,
  formatDate,
  formatMoney,
  orderStatusBadge,
  paymentMethodLabel,
} from "@/lib/format";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { OrderStatusSelect } from "@/components/OrderStatusSelect";
import { DiscountBox } from "@/components/DiscountBox";
import { AddOrderItem } from "@/components/AddOrderItem";
import { BackLink } from "@/components/BackLink";
import { OrderItemRow } from "@/components/OrderItemRow";
import { can, requirePagePermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addOrderItem,
  deleteOrder,
  deleteOrderItem,
  linkBostaShipment,
  sendOrderToBosta,
  toggleOrderArchive,
  saveReturnedItems,
  updatePayment,
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
  bosta_exception: string | null;
  bosta_cod: number;
  bosta_collected: boolean;
  bosta_tracking: string | null;
  bosta_shipping_cost: number;
  delivered_at: string | null;
  return_note: string | null;
  payment_method: string | null;
  amount_paid: number | null;
  customers: {
    id: string;
    full_name: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  order_items: {
    id: string;
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
    returned_quantity: number | null;
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
  // بعد التسليم أو المرتجع مفيش لزمة نطبع بوليصة
  const PRINT_DONE_STATUSES = ["delivered", "returned"];
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_status, order_date, archived, shipping_price, discount,
       bosta_state, bosta_exception, bosta_cod, bosta_collected, bosta_tracking, bosta_shipping_cost,
       delivered_at, return_note, payment_method, amount_paid,
       customers(id, full_name, phone, address),
       order_items(id, quantity, sale_price_at_order, cost_price_at_order, returned_quantity,
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
  const isCancelled = order.order_status === "cancelled";
  const itemsTotal = order.order_items.reduce(
    (sum, item) => sum + item.quantity * item.sale_price_at_order,
    0
  );
  // الملغي: مفيش شحن يتحسب
  const grandTotal =
    itemsTotal - order.discount + (isCancelled ? 0 : order.shipping_price);

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

  // ===== سجل الأوردر: بنجمّع الأحداث الثابتة + سجل النشاط + التعليقات =====
  const fmtWhen = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("ar-EG", {
          timeZone: "Africa/Cairo",
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";

  const { data: orderLog } = order.order_number
    ? await createAdminClient()
        .from("activity_log")
        .select("actor_name, action, summary, created_at")
        .like("summary", `%${order.order_number}%`)
        .order("created_at", { ascending: true })
        .limit(60)
        .overrideTypes<
          {
            actor_name: string | null;
            action: string;
            summary: string | null;
            created_at: string;
          }[]
        >()
    : { data: [] };

  type Ev = { at: string; text: string; when: string; who?: string; dot: string };
  const timeline: Ev[] = [];
  if (order.order_date) {
    timeline.push({
      at: order.order_date,
      text: "اتعمل الأوردر",
      when: fmtWhen(order.order_date),
      dot: "bg-blue-500",
    });
  }
  for (const l of orderLog ?? []) {
    timeline.push({
      at: l.created_at,
      text: l.summary ?? l.action,
      when: fmtWhen(l.created_at),
      who: l.actor_name ?? undefined,
      dot: l.action.startsWith("bosta")
        ? "bg-[#E30613]"
        : l.action.includes("delete")
          ? "bg-red-500"
          : "bg-gray-400",
    });
  }
  if (order.delivered_at) {
    timeline.push({
      at: order.delivered_at,
      text: "اتسلّم للعميل",
      when: fmtWhen(order.delivered_at),
      dot: "bg-green-600",
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

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
      <AutoRefresh seconds={30} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-bold text-gray-900 sm:text-xl">
            أوردر {order.order_number ?? "بدون رقم"}
          </h1>
          <span
            className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {order.archived && (
            <span className="inline-block shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              مؤرشف
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* السابق = الأقدم */}
          {nextOrder ? (
            <Link
              href={`/orders/${nextOrder.id}`}
              title="السابق (الأقدم)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ) : (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          )}
          {/* التالي = الأجدد */}
          {prevOrder ? (
            <Link
              href={`/orders/${prevOrder.id}`}
              title="التالي (الأجدد)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </Link>
          ) : (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </span>
          )}
          <BackLink href="/orders" label="الرجوع للأوردرات" variant="exit" />
        </div>
      </div>

      {/* بوسطة واقفة ومحتاجة تصرّف — بنوضّح السبب ونخلي الأكشن من هنا */}
      {(order.order_status === "awaiting_action" || order.bosta_exception) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-lg leading-none">⚠️</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-amber-900">
                بوسطة محتاجة تصرّف منك
              </div>
              {order.bosta_exception && (
                <div className="mt-0.5 text-sm text-amber-800" dir="auto">
                  السبب: {order.bosta_exception}
                </div>
              )}
              {isAdmin && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {whatsappLink && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      كلّم العميل واتساب
                    </a>
                  )}
                  {order.customers?.id && (
                    <Link
                      href={`/customers/${order.customers.id}`}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm"
                    >
                      عدّل العنوان
                    </Link>
                  )}
                  <form action={updateOrderStatus}>
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <input
                      type="hidden"
                      name="return_to"
                      value={`/orders/${order.id}`}
                    />
                    <ConfirmButton
                      message="تلغي الأوردر ده؟ (بلّغ بوسطة كمان إنك عايز ترجّع الشحنة)"
                      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                    >
                      ألغِ الأوردر
                    </ConfirmButton>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* التغيير اليدوي للحالة من جوّه الأوردر: للأدمن بس */}
      {isAdmin && (
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
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">بيانات العميل</h2>
            {order.customers?.id && (
              <Link
                href={`/customers/${order.customers.id}`}
                className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 active:scale-95"
              >
                صفحة العميل
              </Link>
            )}
          </div>
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
              {/* تقسيمة الشحن — سطر واحد لكل بند */}
              {order.bosta_shipping_cost > 0 &&
                (() => {
                  const bundleShare = bundlePerOrder(
                    DEFAULT_BUNDLE.price,
                    DEFAULT_BUNDLE.shipments
                  );
                  const net =
                    order.shipping_price -
                    bundleShare -
                    order.bosta_shipping_cost;
                  return (
                    <div className="mt-1 space-y-1 rounded-lg bg-gray-50 p-2.5 text-xs">
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-600">دفعه العميل</span>
                        <span className="font-medium text-green-700">
                          {formatMoney(order.shipping_price)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-600">
                          نصيبه من الباقة
                          <span className="block text-[10px] text-gray-400">
                            باقة {DEFAULT_BUNDLE.label}:{" "}
                            {formatMoney(DEFAULT_BUNDLE.price)} ÷{" "}
                            {DEFAULT_BUNDLE.shipments} شحنة
                          </span>
                        </span>
                        <span className="font-medium text-red-700">
                          − {formatMoney(bundleShare)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-600">رسوم بوسطة</span>
                        <span className="font-medium text-red-700">
                          − {formatMoney(order.bosta_shipping_cost)}
                        </span>
                      </div>
                      <div
                        className={`mt-1 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 ${
                          net >= 0 ? "bg-green-50" : "bg-red-50"
                        }`}
                      >
                        <span
                          className={`font-medium ${net >= 0 ? "text-green-800" : "text-red-800"}`}
                        >
                          {net >= 0
                            ? "كسبت من الشحن"
                            : "دفعت من جيبك على الشحن"}
                        </span>
                        <span
                          className={`text-sm font-bold ${net >= 0 ? "text-green-700" : "text-red-700"}`}
                        >
                          {formatMoney(Math.abs(net))}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-500">فلوسك</dt>
                <dd>
                  {order.bosta_collected ? (
                    <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      وصلت
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      لسه
                    </span>
                  )}
                </dd>
              </div>
              {order.bosta_tracking &&
                canPrint &&
                !PRINT_DONE_STATUSES.includes(order.order_status ?? "") && (
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

      {/* الدفع والمرتجع بعد التسليم */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">الدفع</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">الطريقة</dt>
              <dd className="text-gray-900">
                {paymentMethodLabel(order.payment_method)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">مدفوع مقدماً</dt>
              <dd className="text-gray-900">
                {formatMoney(order.amount_paid ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-gray-100 pt-2">
              <dt className="font-medium text-gray-700">المطلوب تحصيله</dt>
              <dd className="font-bold text-gray-900">
                {formatMoney(Math.max(0, grandTotal - (order.amount_paid ?? 0)))}
              </dd>
            </div>
          </dl>
          {canItems && (
            <form
              action={updatePayment}
              className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">طريقة الدفع</label>
                <select
                  name="payment_method"
                  defaultValue={order.payment_method ?? "cod"}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">مدفوع مقدماً</label>
                <input
                  key={`paid-${order.amount_paid}`}
                  type="number"
                  name="amount_paid"
                  defaultValue={order.amount_paid ?? 0}
                  min={0}
                  step="0.01"
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
              >
                حفظ
              </button>
              <p className="w-full text-xs text-gray-400">
                المطلوب تحصيله من بوسطة = الإجمالي ناقص المدفوع مقدماً
              </p>
            </form>
          )}
        </div>

        {/* تفاصيل المرتجع بعد التسليم — الحالة نفسها بتتغيّر من فوق */}
        {isAdmin && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-gray-900">
              تفاصيل المرتجع
            </h2>
            {order.order_status === "returned_after_delivery" ? (
              <p className="mb-2 text-sm text-gray-700">
                الأوردر ده مرتجع بعد التسليم ومش محسوب في المبيعات.
              </p>
            ) : (
              <p className="mb-2 text-xs text-gray-400">
                لو العميل استلم وبعدين رجّع، غيّر الحالة لـ &quot;مرتجع بعد
                التسليم&quot; من فوق، واكتب هنا إيه اللي رجع. اعمل شحنة المرتجع في
                بوسطة يدوي، وسجّل الفلوس اللي رجّعتها للعميل في الخزنة.
              </p>
            )}
            {/* بنختار من منتجات الأوردر نفسه إيه اللي رجع وكميته */}
            <form action={saveReturnedItems} className="space-y-2">
              <input type="hidden" name="order_id" value={order.id} />
              <div className="space-y-1.5">
                {order.order_items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 truncate text-xs text-gray-700">
                      {item.product_variants?.products?.name ?? "—"}
                      <span className="text-gray-400"> (من {item.quantity})</span>
                    </span>
                    <input
                      key={`ret-${item.id}-${item.returned_quantity ?? 0}`}
                      type="number"
                      name={`ret_${item.id}`}
                      defaultValue={item.returned_quantity ?? 0}
                      min={0}
                      max={item.quantity}
                      step={1}
                      aria-label="الكمية الراجعة"
                      className="w-16 shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-center text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <input
                key={`rt-${order.return_note ?? ""}`}
                name="return_tracking"
                defaultValue={order.return_note ?? ""}
                placeholder="رقم شحنة المرتجع في بوسطة (اختياري)"
                dir="ltr"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
              >
                حفظ المرتجع
              </button>
              <p className="text-[10px] text-gray-400">
                الكميات اللي بتحددها بترجع للمخزون تلقائياً
              </p>
            </form>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
          بنود الأوردر
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right text-gray-500">
              <th className="px-2 py-3 font-medium sm:px-4">المنتج</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">الشكل</th>
              <th className="px-2 py-3 font-medium sm:px-4">الكمية</th>
              <th className="px-2 py-3 font-medium sm:px-4">السعر</th>
              <th className="px-4 py-3 font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {order.order_items.map((item) =>
              canItems ? (
                <OrderItemRow
                  key={item.id}
                  orderId={order.id}
                  itemId={item.id}
                  productName={item.product_variants?.products?.name ?? "—"}
                  variantName={item.product_variants?.variant_name ?? "—"}
                  quantity={item.quantity}
                  salePrice={item.sale_price_at_order}
                  updateAction={updateOrderItem}
                  deleteAction={deleteOrderItem}
                />
              ) : (
                <tr key={item.id} className="border-b border-gray-100 last:border-0">
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
              )
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 text-gray-700">
              <td className="px-4 py-2" colSpan={4}>
                إجمالي المنتجات
              </td>
              <td className="px-4 py-2">{formatMoney(itemsTotal)}</td>
            </tr>
            {/* الأوردر الملغي مفيهوش شحن خالص */}
            {!isCancelled && (
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
            )}
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

      {/* ===== سجل الأوردر: من أول ما اتعمل لحد آخر حركة ===== */}
      <div className="rounded-xl bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
          سجل الأوردر
        </h2>
        <ol className="space-y-0 px-5 py-4">
          {timeline.length === 0 ? (
            <li className="text-sm text-gray-400">مفيش حركات مسجّلة.</li>
          ) : (
            timeline.map((t, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {/* خط رأسي بين النقط */}
                {i < timeline.length - 1 && (
                  <span className="absolute start-[5px] top-3 h-full w-px bg-gray-200" />
                )}
                <span
                  className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-900">{t.text}</div>
                  <div className="text-xs text-gray-400">
                    {t.when}
                    {t.who ? ` · ${t.who}` : ""}
                  </div>
                </div>
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  );
}
