import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ORDER_STATUS_OPTIONS,
  formatDate,
  formatMoney,
  orderStatusBadge,
} from "@/lib/format";

// الأوردر اللي مع شركة الشحن — حالته بتتغير من بوسطة، فبنقفل تعديلها من القايمة
const AT_SHIPPING = ["shipped", "delivered", "returned"];
// الحالات دي بتتغير من جوه صفحة الأوردر بس — مش من قايمة الاختيار برة
const LIST_STATUS_OPTIONS_EXCLUDED = ["shipped", "delivered", "returned"];
// الأوردر الملغي بيتقفل تعديله من برة بعد دقيقتين
const CANCEL_LOCK_MS = 2 * 60 * 1000;

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
import { AutoRefresh } from "@/components/AutoRefresh";
import { bulkUpdateStatus } from "./[id]/actions";

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
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, order_status, order_date, cancelled_at, shipping_price, discount, bosta_state, bosta_collected, customers(full_name, phone), order_items(quantity, sale_price_at_order), order_comments(id, author_name, body, created_at)"
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
          {isAdmin && (
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
          تم حفظ الحالة الجديدة
        </div>
      )}
      {bulk && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم تغيير حالة {bulk} أوردر
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/orders"
          className={`rounded-full px-3 py-1 text-xs font-medium ${
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
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === option.value && !showArchived
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
            }`}
          >
            {option.label}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-300"></span>
        <Link
          href={showArchived ? "/orders" : "/orders?archived=1"}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            showArchived
              ? "bg-amber-600 text-white"
              : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
          }`}
        >
          الأرشيف
        </Link>
        <form action="/orders" className="flex items-center gap-1">
          {status && <input type="hidden" name="status" value={status} />}
          {showArchived && <input type="hidden" name="archived" value="1" />}
          <input
            name="q"
            defaultValue={searchTerm}
            placeholder="دور برقم الأوردر أو اسم العميل أو تليفونه"
            className="w-64 rounded-full border-0 bg-white px-3 py-1 text-xs text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          <button
            type="submit"
            className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
          >
            بحث
          </button>
          {searchTerm && (
            <Link
              href={returnTo}
              className="rounded-full bg-white px-2 py-1 text-xs text-gray-500 shadow-sm hover:bg-gray-100"
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
          />
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
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
                        if (AT_SHIPPING.includes(st) || cancelLocked) {
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
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-green-50 text-green-600 hover:bg-green-100"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.17-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.25 8.25-8.25m-2.16 4.42c-.2 0-.5.07-.77.36-.26.29-1 .98-1 2.4 0 1.42 1.03 2.79 1.17 2.98.14.19 1.99 3.04 4.83 4.26.68.29 1.21.46 1.62.6.68.21 1.3.18 1.79.11.55-.08 1.68-.69 1.92-1.35.24-.66.24-1.23.17-1.35-.07-.12-.26-.19-.55-.33-.29-.14-1.68-.83-1.94-.92-.26-.1-.45-.14-.64.14-.19.29-.74.92-.9 1.11-.17.19-.33.21-.62.07-.29-.14-1.2-.44-2.29-1.41-.85-.75-1.42-1.68-1.58-1.97-.17-.29-.02-.44.12-.58.13-.13.29-.33.43-.5.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.07-.14-.63-1.53-.87-2.1-.23-.55-.46-.47-.63-.48l-.53-.01" />
                            </svg>
                          </a>
                        )}
                        <OrderComments
                          orderId={order.id}
                          orderNumber={order.order_number ?? ""}
                          comments={order.order_comments}
                          isAdmin={true}
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
