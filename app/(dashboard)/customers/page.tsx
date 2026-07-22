import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { CustomerRow } from "@/components/CustomerRow";
import { requirePagePermission } from "@/lib/permissions";

type CustomerData = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  orders: {
    id: string;
    order_date: string | null;
    order_status: string | null;
    shipping_price: number;
    discount: number;
    order_items: { quantity: number; sale_price_at_order: number }[];
  }[];
};

const EXCLUDED = ["cancelled", "returned"];

const SORTS: Record<string, string> = {
  total: "الأكبر مبلغاً",
  orders: "الأكتر أوردرات",
  recent: "آخر أوردر",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
}) {
  const {
    q,
    sort: rawSort,
    saved,
    deleted,
    error: actionError,
  } = await searchParams;
  const searchTerm = (q ?? "").trim();
  const sort = SORTS[rawSort ?? ""] ? (rawSort as string) : "total";
  await requirePagePermission("customers.view");
  const supabase = await createClient();

  const { data: customers, error } = await supabase
    .from("customers")
    .select(
      `id, full_name, phone, address,
       orders(id, order_date, order_status, shipping_price, discount,
         order_items(quantity, sale_price_at_order))`
    )
    .limit(1000)
    .overrideTypes<CustomerData[]>();

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
          ) -
          order.discount +
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
    .sort((a, b) => {
      if (sort === "orders") return b.ordersCount - a.ordersCount;
      if (sort === "recent")
        return (b.lastOrderDate ?? "").localeCompare(a.lastOrderDate ?? "");
      return b.total - a.total;
    });

  const sortHref = (key: string) => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("q", searchTerm);
    if (key !== "total") params.set("sort", key);
    const qs = params.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">العملاء</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">{rows.length} عميل</span>
          <form action="/customers" className="flex items-center gap-1">
            {sort !== "total" && (
              <input type="hidden" name="sort" value={sort} />
            )}
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">ترتيب حسب:</span>
        {Object.entries(SORTS).map(([key, label]) => (
          <Link
            key={key}
            href={sortHref(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sort === key
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم حفظ بيانات العميل
        </div>
      )}
      {deleted && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          تم مسح العميل
        </div>
      )}

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
                <CustomerRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
