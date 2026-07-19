import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_OPTIONS, formatDate, formatMoney } from "@/lib/format";
import {
  addOrderComment,
  deleteOrderComment,
  updateOrderStatus,
} from "./[id]/actions";
import { OrderComments } from "@/components/OrderComments";
import { OrderStatusSelect } from "@/components/OrderStatusSelect";
import { BulkStatusBar, SelectAllCheckbox } from "@/components/BulkStatusBar";
import { bulkUpdateStatus } from "./[id]/actions";

type OrderRow = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  shipping_price: number;
  customers: { full_name: string | null; phone: string | null } | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
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
  }>;
}) {
  const { status, deleted, archived, saved, q, bulk } = await searchParams;
  const showArchived = archived === "1";
  const searchTerm = (q ?? "").trim();
  const returnTo = `/orders${showArchived ? "?archived=1" : status ? `?status=${status}` : ""}`;
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, order_status, order_date, shipping_price, customers(full_name, phone), order_items(quantity, sale_price_at_order), order_comments(id, author_name, body, created_at)"
    )
    .eq("archived", showArchived)
    .order("created_at", { referencedTable: "order_comments", ascending: true });

  if (status) {
    query = query.eq("order_status", status);
  }

  const { data: fetchedOrders, error } = await query
    .order("order_date", { ascending: false })
    // في البحث بنوسّع النطاق عشان يشمل الأوردرات القديمة كلها
    .limit(searchTerm ? 1000 : 100)
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
                <th className="px-4 py-3 font-medium">رقم الأوردر</th>
                <th className="px-4 py-3 font-medium">العميل</th>
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">الإجمالي</th>
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
                  ) + order.shipping_price;
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
                    <td className="px-4 py-3 text-gray-700">
                      {order.customers?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(order.order_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(total)}
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusSelect
                        orderId={order.id}
                        currentStatus={order.order_status ?? "new"}
                        returnTo={returnTo}
                        options={ORDER_STATUS_OPTIONS}
                        updateAction={updateOrderStatus}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/orders/${order.id}`}
                          className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        >
                          فتح
                        </Link>
                        <OrderComments
                          orderId={order.id}
                          orderNumber={order.order_number ?? ""}
                          comments={order.order_comments}
                          isAdmin={true}
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
        </>
      )}
    </div>
  );
}
