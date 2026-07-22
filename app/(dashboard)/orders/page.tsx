import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ORDER_STATUS_OPTIONS,
  SHIPMENT_STATUSES,
  formatDate,
  formatMoney,
  orderStatusBadge,
} from "@/lib/format";

// حالات الشحن بتتحدّث من بوسطة — بنقفل تغييرها من القايمة برة
const AT_SHIPPING = SHIPMENT_STATUSES;
// ونشيلها من قايمة الاختيار برة (التعديل اليدوي من جوه الأوردر بس)
const LIST_STATUS_OPTIONS_EXCLUDED = SHIPMENT_STATUSES;
// الأوردر الملغي بيتقفل تعديله من برة بعد 30 ثانية
const CANCEL_LOCK_MS = 30 * 1000;

// لينك واتساب العميل بصيغة مصر الدولية (20)
function waLink(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const intl = digits.startsWith("20") ? digits : "20" + digits.replace(/^0+/, "");
  return `https://wa.me/${intl}`;
}
import {
  addOrderComment,
  deleteOrderComment,
  updateOrderStatusInline,
} from "./[id]/actions";
import { OrderComments } from "@/components/OrderComments";
import { OrderStatusSelect } from "@/components/OrderStatusSelect";
import { BulkStatusBar, SelectAllCheckbox } from "@/components/BulkStatusBar";
import { SendBostaRowButton } from "@/components/SendBostaRowButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { bulkUpdateStatus, bulkSendToBosta } from "./[id]/actions";
import { can, requirePagePermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConfirmButton } from "@/components/ConfirmButton";
import { approveDeletion, rejectDeletion } from "./[id]/actions";

type OrderRow = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  cancelled_at: string | null;
  shipping_price: number;
  discount: number;
  bosta_state: string | null;
  bosta_collected: boolean;
  bosta_tracking: string | null;
  customers: { full_name: string | null; phone: string | null } | null;
  order_items: {
    quantity: number;
    sale_price_at_order: number;
  }[];
  order_comments: {
    id: string;
    author_name: string;
    body: string;
    created_at: string;
  }[];
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    deleted?: string;
    archived?: string;
    saved?: string;
    q?: string;
    bulk?: string;
    show?: string;
  }>;
}) {
  const { status, deleted, archived, saved, q, bulk, show } = await searchParams;
  const showArchived = archived === "1";
  const searchTerm = (q ?? "").trim();
  const returnTo = `/orders${showArchived ? "?archived=1" : status ? `?status=${status}` : ""}`;
  // عدد المعروض: 50 افتراضي، وبيزيد بزرار "عرض المزيد". في البحث بنجيب أكتر
  const showCount = Math.min(
    Math.max(Number(show) || 50, 50),
    5000
  );
  const fetchLimit = searchTerm ? 3000 : showCount;
  const user = await requirePagePermission("orders.view");
  const canCreate = can(user, "orders.create");
  const canStatus = can(user, "orders.status");
  const canPrint = can(user, "ship.print");
  const canSend = can(user, "ship.send");
  const canComments = can(user, "orders.comments");
  const supabase = await createClient();

  // طلبات الحذف المستنية موافقة الأدمن (مبدأ الشخصين)
  const pendingDeletions = user.isAdmin
    ? (
        await createAdminClient()
          .from("deletion_requests")
          .select("id, order_number, requested_by_name, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .overrideTypes<
            {
              id: string;
              order_number: string | null;
              requested_by_name: string | null;
              created_at: string;
            }[]
          >()
      ).data ?? []
    : [];

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, order_status, order_date, cancelled_at, shipping_price, discount, bosta_state, bosta_collected, bosta_tracking, customers(full_name, phone), order_items(quantity, sale_price_at_order), order_comments(id, author_name, body, created_at)"
    )
    .eq("archived", showArchived)
    .order("created_at", { referencedTable: "order_comments", ascending: true });

  if (status) {
    query = query.eq("order_status", status);
  }

  const { data: fetchedOrders, error } = await query
    .order("order_date", { ascending: false })
    .limit(fetchLimit)
    .overrideTypes<OrderRow[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل الأوردرات: {error.message}
      </div>
    );
  }

  // فلترة البحث: رقم الأوردر أو اسم العميل أو تليفونه
  const normalized = searchTerm.toLowerCase().replace(/\s+/g, "");
  const orders = searchTerm
    ? fetchedOrders.filter((order) => {
        const number = (order.order_number ?? "").toLowerCase();
        const name = (order.customers?.full_name ?? "")
          .toLowerCase()
          .replace(/\s+/g, "");
        const phone = (order.customers?.phone ?? "").replace(/\s+/g, "");
        return (
          number.includes(searchTerm.toLowerCase()) ||
          name.includes(normalized) ||
          phone.includes(normalized)
        );
      })
    : fetchedOrders;

  return (
    <div>
      <AutoRefresh seconds={10} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">الأوردرات</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{orders.length} أوردر</span>
          {canCreate && (
            <Link
              href="/orders/new"
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
            >
              إضافة أوردر
            </Link>
          )}
        </div>
      </div>

      {deleted && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم مسح الأوردر ورجّعنا مخزونه
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {saved === "1" ? "تم حفظ الحالة الجديدة" : saved}
        </div>
      )}
      {bulk && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم تغيير حالة {bulk} أوردر
        </div>
      )}

      {pendingDeletions.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 text-sm font-bold text-amber-800">
            طلبات حذف مستنية موافقتك ({pendingDeletions.length})
          </div>
          <ul className="space-y-2">
            {pendingDeletions.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm"
              >
                <span className="text-gray-800">
                  أوردر <span className="font-medium">{r.order_number ?? "—"}</span>{" "}
                  <span className="text-gray-500">
                    (طلبه {r.requested_by_name ?? "غير معروف"})
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <form action={approveDeletion}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <ConfirmButton
                      message={`متأكد إنك عايز تمسح أوردر ${r.order_number ?? ""} نهائياً؟`}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      وافق وامسح
                    </ConfirmButton>
                  </form>
                  <form action={rejectDeletion}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      ارفض
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 space-y-2">
        {/* شرائح الحالة — سطر واحد بيتزحلق لو ضاق */}
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          <Link
            href="/orders"
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
              !status && !showArchived
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
            }`}
          >
            الكل
          </Link>
          {ORDER_STATUS_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/orders?status=${option.value}`}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                status === option.value && !showArchived
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
              }`}
            >
              {option.label}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-gray-300"></span>
          <Link
            href={showArchived ? "/orders" : "/orders?archived=1"}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
              showArchived
                ? "bg-amber-600 text-white"
                : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
            }`}
          >
            الأرشيف
          </Link>
        </div>
        {/* البحث — سطر لوحده، عرض كامل على الموبايل */}
        <form action="/orders" className="flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          {showArchived && <input type="hidden" name="archived" value="1" />}
          <input
            name="q"
            defaultValue={searchTerm}
            placeholder="دور برقم الأوردر أو اسم العميل أو تليفونه"
            className="w-full flex-1 rounded-full border-0 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 sm:max-w-xs"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            بحث
          </button>
          {searchTerm && (
            <Link
              href={returnTo}
              className="shrink-0 rounded-full bg-white px-3 py-2 text-sm text-gray-500 shadow-sm hover:bg-gray-100"
            >
              ✕
            </Link>
          )}
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          {searchTerm
            ? `مفيش أوردرات فيها "${searchTerm}".`
            : showArchived
              ? "الأرشيف فاضي."
              : status
                ? "مفيش أوردرات بالحالة دي."
                : "لسه مفيش أوردرات. أول ما ييجي أوردر من شوبيفاي هيظهر هنا تلقائياً."}
        </div>
      ) : (
        <>
          <BulkStatusBar
            returnTo={returnTo}
            options={ORDER_STATUS_OPTIONS}
            updateAction={bulkUpdateStatus}
            canStatus={canStatus}
            canPrint={canPrint}
            canSend={canSend}
            sendAction={bulkSendToBosta}
          />

          {/* ===== موبايل: كروت (بدل الجدول عشان مفيش سحب جانبي) ===== */}
          <div className="space-y-3 md:hidden">
            {orders.map((order) => {
              const total =
                order.order_items.reduce(
                  (sum, item) => sum + item.quantity * item.sale_price_at_order,
                  0
                ) -
                order.discount +
                order.shipping_price;
              const pieces = order.order_items.reduce(
                (sum, item) => sum + item.quantity,
                0
              );
              const st = order.order_status ?? "new";
              const cancelLocked =
                st === "cancelled" &&
                (!order.cancelled_at ||
                  Date.now() - new Date(order.cancelled_at).getTime() >
                    CANCEL_LOCK_MS);
              const wa = waLink(order.customers?.phone ?? null);
              return (
                <div
                  key={order.id}
                  className="relative rounded-xl bg-white p-3 shadow-sm"
                >
                  {/* الكارت كله بيفتح الأوردر — الأزرار فوقه بتشتغل عادي */}
                  <Link
                    href={`/orders/${order.id}`}
                    aria-label={`فتح أوردر ${order.order_number ?? ""}`}
                    className="absolute inset-0 z-0 rounded-xl"
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        data-order-checkbox
                        data-has-awb={order.bosta_tracking ? "1" : "0"}
                        value={order.id}
                        aria-label="تحديد الأوردر"
                        className="relative z-10 mt-1 h-5 w-5 shrink-0 rounded border-gray-300"
                      />
                      <div>
                        <div className="text-base font-bold text-gray-900">
                          {order.customers?.full_name ?? "بدون اسم"}
                        </div>
                        <div className="text-xs text-gray-500">
                          أوردر {order.order_number ?? "—"}
                        </div>
                      </div>
                    </div>
                    {!canStatus || AT_SHIPPING.includes(st) || cancelLocked ? (
                      <span
                        className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${orderStatusBadge(st).className}`}
                      >
                        {orderStatusBadge(st).label}
                      </span>
                    ) : (
                      <div className="relative z-10 shrink-0">
                        <OrderStatusSelect
                          orderId={order.id}
                          currentStatus={st}
                          returnTo={returnTo}
                          options={ORDER_STATUS_OPTIONS.filter(
                            (o) =>
                              !LIST_STATUS_OPTIONS_EXCLUDED.includes(o.value)
                          )}
                          updateAction={updateOrderStatusInline}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span>{formatDate(order.order_date)}</span>
                      <span>{pieces} قطعة</span>
                      <span className="flex items-center gap-1">
                        التحصيل:
                        {order.bosta_state ? (
                          order.bosta_collected ? (
                            <span className="font-medium text-green-700">
                              اتحصّل
                            </span>
                          ) : (
                            <span className="text-gray-500">لسه</span>
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </span>
                    </div>
                    <div className="shrink-0 text-left text-lg font-bold text-gray-900">
                      {formatMoney(total)}
                    </div>
                  </div>

                  <div className="relative z-10 mt-2 flex w-fit items-center gap-3 border-t border-gray-100 pt-2">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="واتساب العميل"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600"
                      >
                        <svg
                          viewBox="0 0 448 512"
                          fill="currentColor"
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        >
                          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                        </svg>
                      </a>
                    )}
                    {order.bosta_tracking && canPrint && (
                      <a
                        href={`/orders/${order.id}/awb`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="اطبع البوليصة"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600"
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
                      </a>
                    )}
                    {!order.bosta_tracking && canSend && (
                      <SendBostaRowButton
                        orderId={order.id}
                        orderNumber={order.order_number ?? ""}
                        sendAction={bulkSendToBosta}
                      />
                    )}
                    <div className="ms-auto">
                      <OrderComments
                        orderId={order.id}
                        orderNumber={order.order_number ?? ""}
                        comments={order.order_comments}
                        isAdmin={canComments}
                        hideDot={[
                          "packed",
                          "shipped",
                          "delivered",
                          "returned",
                          "cancelled",
                        ].includes(order.order_status ?? "")}
                        addAction={addOrderComment}
                        deleteAction={deleteOrderComment}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ===== كمبيوتر: جدول ===== */}
          <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right text-gray-500">
                <th className="px-4 py-3 font-medium">
                  <SelectAllCheckbox />
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  رقم الأوردر
                </th>
                <th className="w-full px-4 py-3 font-medium">العميل</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  التاريخ
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  الإجمالي
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  التحصيل
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  عدد القطع
                </th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const total =
                  order.order_items.reduce(
                    (sum, item) =>
                      sum + item.quantity * item.sale_price_at_order,
                    0
                  ) -
                  order.discount +
                  order.shipping_price;
                const pieces = order.order_items.reduce(
                  (sum, item) => sum + item.quantity,
                  0
                );
                return (
                  <tr
                    key={order.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        data-order-checkbox
                        data-has-awb={order.bosta_tracking ? "1" : "0"}
                        value={order.id}
                        aria-label="تحديد الأوردر"
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {order.order_number ?? "بدون رقم"}
                      </Link>
                    </td>
                    <td className="w-full px-4 py-3 text-gray-700">
                      {order.customers?.full_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {formatDate(order.order_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(total)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {order.bosta_state ? (
                        order.bosta_collected ? (
                          <span className="inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            اتحصّل
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            لسه
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {pieces} قطعة
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const st = order.order_status ?? "new";
                        // ملغي من أكتر من دقيقتين: التعديل من جوه الأوردر بس
                        const cancelLocked =
                          st === "cancelled" &&
                          (!order.cancelled_at ||
                            Date.now() - new Date(order.cancelled_at).getTime() >
                              CANCEL_LOCK_MS);
                        if (
                          !canStatus ||
                          AT_SHIPPING.includes(st) ||
                          cancelLocked
                        ) {
                          return (
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${orderStatusBadge(st).className}`}
                              title="التعديل من جوّه الأوردر بس"
                            >
                              {orderStatusBadge(st).label}
                            </span>
                          );
                        }
                        return (
                          <OrderStatusSelect
                            orderId={order.id}
                            currentStatus={st}
                            returnTo={returnTo}
                            options={ORDER_STATUS_OPTIONS.filter(
                              (o) =>
                                !LIST_STATUS_OPTIONS_EXCLUDED.includes(o.value)
                            )}
                            updateAction={updateOrderStatusInline}
                          />
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/orders/${order.id}`}
                          className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        >
                          فتح
                        </Link>
                        {waLink(order.customers?.phone ?? null) && (
                          <a
                            href={waLink(order.customers?.phone ?? null)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="واتساب العميل"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600 hover:bg-green-100"
                          >
                            <svg
                              viewBox="0 0 448 512"
                              fill="currentColor"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                            </svg>
                          </a>
                        )}
                        {order.bosta_tracking && canPrint && (
                          <a
                            href={`/orders/${order.id}/awb`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="اطبع البوليصة"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                          </a>
                        )}
                        {!order.bosta_tracking && canSend && (
                          <SendBostaRowButton
                            orderId={order.id}
                            orderNumber={order.order_number ?? ""}
                            sendAction={bulkSendToBosta}
                          />
                        )}
                        <OrderComments
                          orderId={order.id}
                          orderNumber={order.order_number ?? ""}
                          comments={order.order_comments}
                          isAdmin={canComments}
                          hideDot={[
                            "packed",
                            "shipped",
                            "delivered",
                            "returned",
                            "cancelled",
                          ].includes(order.order_status ?? "")}
                          addAction={addOrderComment}
                          deleteAction={deleteOrderComment}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {!searchTerm && orders.length >= showCount && (
            <div className="mt-4 flex justify-center">
              <Link
                scroll={false}
                href={(() => {
                  const params = new URLSearchParams();
                  if (status) params.set("status", status);
                  if (showArchived) params.set("archived", "1");
                  params.set("show", String(showCount + 50));
                  return `/orders?${params.toString()}`;
                })()}
                className="rounded-lg bg-white px-6 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100"
              >
                عرض المزيد
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
