import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, orderStatusBadge } from "@/lib/format";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteCustomer } from "../actions";

type CustomerDetail = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  orders: {
    id: string;
    order_number: string | null;
    order_status: string | null;
    order_date: string | null;
    shipping_price: number;
    order_items: { quantity: number; sale_price_at_order: number }[];
  }[];
};

const EXCLUDED = ["cancelled", "returned"];

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");

  const { data: customer, error } = await supabase
    .from("customers")
    .select(
      `id, full_name, phone, address,
       orders(id, order_number, order_status, order_date, shipping_price,
         order_items(quantity, sale_price_at_order))`
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<CustomerDetail>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل العميل: {error.message}
      </div>
    );
  }
  if (!customer) {
    notFound();
  }

  const orders = [...customer.orders].sort((a, b) =>
    (b.order_date ?? "").localeCompare(a.order_date ?? "")
  );
  const validOrders = orders.filter(
    (o) => !EXCLUDED.includes(o.order_status ?? "")
  );
  const orderTotal = (o: CustomerDetail["orders"][number]) =>
    o.order_items.reduce((s, i) => s + i.quantity * i.sale_price_at_order, 0) +
    o.shipping_price;
  const total = validOrders.reduce((s, o) => s + orderTotal(o), 0);
  const deliveredCount = orders.filter(
    (o) => o.order_status === "delivered"
  ).length;
  const avgOrder = validOrders.length > 0 ? total / validOrders.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          {customer.full_name ?? "بدون اسم"}
        </h1>
        <Link
          href="/customers"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          الرجوع للعملاء
        </Link>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">التليفون</dt>
            <dd className="text-gray-900" dir="ltr">
              {customer.phone ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-gray-500">العنوان</dt>
            <dd className="text-left text-gray-900">
              {customer.address ?? "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">عدد الأوردرات</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {validOrders.length}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">إجمالي المشتريات</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(total)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">متوسط الأوردر</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(Math.round(avgOrder))}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">أوردرات اتسلمت</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {deliveredCount}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
          أوردرات العميل
        </h2>
        {orders.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            لسه مفيش أوردرات للعميل ده
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right text-gray-500">
                <th className="px-4 py-3 font-medium">رقم الأوردر</th>
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">الإجمالي</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const badge = orderStatusBadge(order.order_status);
                return (
                  <tr
                    key={order.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {order.order_number ?? "بدون رقم"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(order.order_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatMoney(orderTotal(order))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${order.id}`}
                        className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        فتح
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isAdmin && (
        <div className="flex justify-end border-t border-gray-200 pt-6">
          <form action={deleteCustomer}>
            <input type="hidden" name="customer_id" value={customer.id} />
            <ConfirmButton
              message={`متأكد إنك عايز تمسح العميل "${customer.full_name ?? "بدون اسم"}"؟`}
              className="rounded-lg bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              مسح العميل
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}
