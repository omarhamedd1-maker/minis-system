import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";

type CustomerRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  orders: {
    id: string;
    order_date: string | null;
    order_status: string | null;
    shipping_price: number;
    order_items: { quantity: number; sale_price_at_order: number }[];
  }[];
};

const EXCLUDED = ["cancelled", "returned"];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const searchTerm = (q ?? "").trim();
  const supabase = await createClient();

  const { data: customers, error } = await supabase
    .from("customers")
    .select(
      `id, full_name, phone, address,
       orders(id, order_date, order_status, shipping_price,
         order_items(quantity, sale_price_at_order))`
    )
    .limit(1000)
    .overrideTypes<CustomerRow[]>();

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل العملاء: {error.message}
      </div>
    );
  }

  const normalized = searchTerm.toLowerCase().replace(/\s+/g, "");

  const rows = customers
    .map((customer) => {
      const validOrders = customer.orders.filter(
        (o) => !EXCLUDED.includes(o.order_status ?? "")
      );
      const total = validOrders.reduce(
        (sum, order) =>
          sum +
          order.order_items.reduce(
            (s, item) => s + item.quantity * item.sale_price_at_order,
            0
          ) +
          order.shipping_price,
        0
      );
      const lastOrderDate = customer.orders.reduce<string | null>(
        (latest, order) =>
          order.order_date && (!latest || order.order_date > latest)
            ? order.order_date
            : latest,
        null
      );
      return {
        id: customer.id,
        name: customer.full_name ?? "بدون اسم",
        phone: customer.phone,
        address: customer.address,
        ordersCount: validOrders.length,
        total,
        lastOrderDate,
      };
    })
    .filter((row) => {
      if (!searchTerm) return true;
      const name = row.name.toLowerCase().replace(/\s+/g, "");
      const phone = (row.phone ?? "").replace(/\s+/g, "");
      return name.includes(normalized) || phone.includes(normalized);
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">العملاء</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">{rows.length} عميل</span>
          <form action="/customers" className="flex items-center gap-1">
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="دور بالاسم أو التليفون"
              className="w-52 rounded-full border-0 bg-white px-3 py-1 text-xs text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
            <button
              type="submit"
              className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
            >
              بحث
            </button>
            {searchTerm && (
              <Link
                href="/customers"
                className="rounded-full bg-white px-2 py-1 text-xs text-gray-500 shadow-sm hover:bg-gray-100"
              >
                ✕
              </Link>
            )}
          </form>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center text-gray-500 shadow-sm">
          {searchTerm
            ? `مفيش عملاء فيهم "${searchTerm}".`
            : "لسه مفيش عملاء — بيتسجلوا تلقائياً مع الأوردرات."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-right text-gray-500">
                <th className="px-4 py-3 font-medium">العميل</th>
                <th className="px-4 py-3 font-medium">التليفون</th>
                <th className="px-4 py-3 font-medium">العنوان</th>
                <th className="px-4 py-3 font-medium">الأوردرات</th>
                <th className="px-4 py-3 font-medium">إجمالي المشتريات</th>
                <th className="px-4 py-3 font-medium">آخر أوردر</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-gray-700" dir="ltr">
                    {row.phone ?? "—"}
                  </td>
                  <td className="max-w-48 truncate px-4 py-3 text-gray-700">
                    {row.address ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.ordersCount}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {formatMoney(row.total)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatDate(row.lastOrderDate)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders?q=${encodeURIComponent(row.phone ?? row.name)}`}
                      className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      أوردراته
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
