import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, orderStatusBadge } from "@/lib/format";
import { GroupedBars, HBarList, LineChart } from "@/components/charts";

type OrderRow = {
  id: string;
  order_status: string | null;
  order_date: string | null;
  shipping_price: number;
  customers: { full_name: string | null } | null;
  order_items: {
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
    product_variants: {
      variant_name: string | null;
      products: { name: string | null } | null;
    } | null;
  }[];
};

const EXCLUDED = ["cancelled", "returned"];

const PERIODS: Record<string, { label: string }> = {
  month: { label: "الشهر ده" },
  "30d": { label: "آخر 30 يوم" },
  "3m": { label: "آخر 3 شهور" },
  year: { label: "السنة دي" },
};

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function itemsTotal(order: OrderRow) {
  return order.order_items.reduce(
    (s, i) => s + i.quantity * i.sale_price_at_order,
    0
  );
}

function itemsProfit(order: OrderRow) {
  return order.order_items.reduce(
    (s, i) => s + i.quantity * (i.sale_price_at_order - i.cost_price_at_order),
    0
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: rawPeriod } = await searchParams;
  const period = PERIODS[rawPeriod ?? ""] ? (rawPeriod as string) : "month";

  const now = new Date();
  const today = toDateString(now);

  let periodStart: string;
  if (period === "month") {
    periodStart = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  } else if (period === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    periodStart = toDateString(d);
  } else if (period === "3m") {
    const d = new Date(now);
    d.setDate(d.getDate() - 89);
    periodStart = toDateString(d);
  } else {
    periodStart = `${now.getFullYear()}-01-01`;
  }

  // بنجيب من أول 6 شهور فاتت عشان شارت مقارنة الشهور، مهما كانت الفترة المختارة
  const sixMonthsAgo = toDateString(
    new Date(now.getFullYear(), now.getMonth() - 5, 1)
  );
  const fetchStart = periodStart < sixMonthsAgo ? periodStart : sixMonthsAgo;

  const supabase = await createClient();

  const [ordersResult, expensesResult, variantsResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, order_status, order_date, shipping_price, customers(full_name),
         order_items(quantity, sale_price_at_order, cost_price_at_order,
           product_variants(variant_name, products(name)))`
      )
      .gte("order_date", fetchStart)
      .limit(2000)
      .overrideTypes<OrderRow[]>(),
    supabase
      .from("expenses")
      .select("category, amount, expense_date")
      .gte("expense_date", periodStart)
      .limit(2000)
      .overrideTypes<{ category: string; amount: number; expense_date: string }[]>(),
    supabase
      .from("product_variants")
      .select("cost_price, sale_price, quantity_on_hand")
      .overrideTypes<
        { cost_price: number; sale_price: number; quantity_on_hand: number }[]
      >(),
  ]);

  if (ordersResult.error || expensesResult.error || variantsResult.error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل الإحصائيات:{" "}
        {ordersResult.error?.message ??
          expensesResult.error?.message ??
          variantsResult.error?.message}
      </div>
    );
  }

  const allOrders = ordersResult.data;
  const periodOrders = allOrders.filter(
    (o) => (o.order_date ?? "").slice(0, 10) >= periodStart
  );
  const validOrders = periodOrders.filter(
    (o) => !EXCLUDED.includes(o.order_status ?? "")
  );

  // ملخص الفترة
  const sales = validOrders.reduce((s, o) => s + itemsTotal(o), 0);
  const profit = validOrders.reduce((s, o) => s + itemsProfit(o), 0);
  const expensesTotal = expensesResult.data.reduce((s, e) => s + e.amount, 0);
  const netProfit = profit - expensesTotal;
  const orderCount = validOrders.length;
  const avgOrder = orderCount > 0 ? sales / orderCount : 0;
  const deliveredCount = periodOrders.filter(
    (o) => o.order_status === "delivered"
  ).length;
  const cancelledCount = periodOrders.filter((o) =>
    EXCLUDED.includes(o.order_status ?? "")
  ).length;
  const deliveryRate =
    periodOrders.length > 0
      ? Math.round((deliveredCount / periodOrders.length) * 100)
      : 0;
  const cancelRate =
    periodOrders.length > 0
      ? Math.round((cancelledCount / periodOrders.length) * 100)
      : 0;

  // شارت المبيعات عبر الوقت: يومي للفترات القصيرة، شهري للسنة
  const daily = period !== "year";
  const buckets = new Map<string, number>();
  if (daily) {
    const cursor = new Date(periodStart + "T00:00:00");
    while (toDateString(cursor) <= today) {
      buckets.set(toDateString(cursor), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    for (let m = 0; m <= now.getMonth(); m++) {
      buckets.set(`${now.getFullYear()}-${String(m + 1).padStart(2, "0")}`, 0);
    }
  }
  for (const order of validOrders) {
    const date = (order.order_date ?? "").slice(0, daily ? 10 : 7);
    if (buckets.has(date)) {
      buckets.set(date, (buckets.get(date) ?? 0) + itemsTotal(order));
    }
  }
  const timePoints = [...buckets.entries()].map(([key, value]) => ({
    label: daily
      ? `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`
      : new Date(key + "-01T00:00:00").toLocaleDateString("ar-EG", {
          month: "short",
        }),
    value,
    title: `${key}: ${value.toLocaleString("en")} جنيه`,
  }));

  // مقارنة آخر 6 شهور: مبيعات وأرباح
  const monthGroups: { label: string; a: number; b: number }[] = [];
  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthOrders = allOrders.filter(
      (o) =>
        (o.order_date ?? "").slice(0, 7) === key &&
        !EXCLUDED.includes(o.order_status ?? "")
    );
    monthGroups.push({
      label: d.toLocaleDateString("ar-EG", { month: "short" }),
      a: monthOrders.reduce((s, o) => s + itemsTotal(o), 0),
      b: monthOrders.reduce((s, o) => s + itemsProfit(o), 0),
    });
  }

  // توزيع الحالات
  const statusCounts = new Map<string, number>();
  for (const order of periodOrders) {
    const key = order.order_status ?? "غير محدد";
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  const statusItems = [...statusCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      label: orderStatusBadge(status).label,
      value: count,
      display: `${count} أوردر`,
    }));

  // المصاريف بالنوع
  const expenseByCategory = new Map<string, number>();
  for (const expense of expensesResult.data) {
    expenseByCategory.set(
      expense.category,
      (expenseByCategory.get(expense.category) ?? 0) + expense.amount
    );
  }
  const expenseItems = [...expenseByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({
      label: category,
      value: amount,
      display: formatMoney(amount),
      color: "#e34948",
    }));

  // أفضل المنتجات
  const productStats = new Map<
    string,
    { qty: number; revenue: number; profit: number }
  >();
  for (const order of validOrders) {
    for (const item of order.order_items) {
      const name = [
        item.product_variants?.products?.name ?? "غير معروف",
        item.product_variants?.variant_name,
      ]
        .filter(Boolean)
        .join(" / ");
      const entry = productStats.get(name) ?? { qty: 0, revenue: 0, profit: 0 };
      entry.qty += item.quantity;
      entry.revenue += item.quantity * item.sale_price_at_order;
      entry.profit +=
        item.quantity * (item.sale_price_at_order - item.cost_price_at_order);
      productStats.set(name, entry);
    }
  }
  const topProducts = [...productStats.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  // أفضل العملاء
  const customerStats = new Map<string, { count: number; revenue: number }>();
  for (const order of validOrders) {
    const name = order.customers?.full_name ?? "غير معروف";
    const entry = customerStats.get(name) ?? { count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += itemsTotal(order) + order.shipping_price;
    customerStats.set(name, entry);
  }
  const topCustomers = [...customerStats.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  // قيمة المخزون
  const stockCostValue = variantsResult.data.reduce(
    (s, v) => s + v.cost_price * Math.max(v.quantity_on_hand, 0),
    0
  );
  const stockSaleValue = variantsResult.data.reduce(
    (s, v) => s + v.sale_price * Math.max(v.quantity_on_hand, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">الإحصائيات</h1>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(PERIODS).map(([key, p]) => (
            <Link
              key={key}
              href={`/reports?period=${key}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                period === key
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">المبيعات</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(sales)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">أرباح المنتجات</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatMoney(profit)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">المصاريف</p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {formatMoney(expensesTotal)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">صافي الربح</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              netProfit >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatMoney(netProfit)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">عدد الأوردرات</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{orderCount}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">متوسط قيمة الأوردر</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(Math.round(avgOrder))}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">نسبة التسليم</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {deliveryRate}%
          </p>
          <p className="text-xs text-gray-400">
            {deliveredCount} من {periodOrders.length} أوردر
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">نسبة الإلغاء والمرتجع</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">
            {cancelRate}%
          </p>
          <p className="text-xs text-gray-400">
            {cancelledCount} من {periodOrders.length} أوردر
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-900">
          المبيعات {daily ? "يوم بيوم" : "شهر بشهر"} ({PERIODS[period].label})
        </h2>
        <LineChart points={timePoints} valueSuffix=" جنيه" />
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-gray-900">
          مقارنة آخر 6 شهور
        </h2>
        <GroupedBars groups={monthGroups} aLabel="المبيعات" bLabel="الأرباح" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-gray-900">
            حالات الأوردرات ({PERIODS[period].label})
          </h2>
          <HBarList items={statusItems} />
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-gray-900">
            المصاريف بالنوع ({PERIODS[period].label})
          </h2>
          <HBarList items={expenseItems} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
            أفضل المنتجات ({PERIODS[period].label})
          </h2>
          {topProducts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              مفيش مبيعات في الفترة دي
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-right text-gray-500">
                  <th className="px-4 py-2.5 font-medium">المنتج</th>
                  <th className="px-4 py-2.5 font-medium">الكمية</th>
                  <th className="px-4 py-2.5 font-medium">المبيعات</th>
                  <th className="px-4 py-2.5 font-medium">الربح</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map(([name, stats]) => (
                  <tr
                    key={name}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{stats.qty}</td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {formatMoney(stats.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-green-700">
                      {formatMoney(stats.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <h2 className="border-b border-gray-200 px-5 py-4 text-sm font-bold text-gray-900">
            أفضل العملاء ({PERIODS[period].label})
          </h2>
          {topCustomers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              مفيش عملاء في الفترة دي
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-right text-gray-500">
                  <th className="px-4 py-2.5 font-medium">العميل</th>
                  <th className="px-4 py-2.5 font-medium">الأوردرات</th>
                  <th className="px-4 py-2.5 font-medium">إجمالي المشتريات</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map(([name, stats]) => (
                  <tr
                    key={name}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{stats.count}</td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {formatMoney(stats.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">قيمة المخزون الحالي (بالتكلفة)</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(stockCostValue)}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            قيمة المخزون لو اتباع كله (بسعر البيع)
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(stockSaleValue)}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        كل الأرقام محسوبة لايف من الأوردرات والمصاريف — الأوردرات الملغية
        والمرتجعة مستبعدة من المبيعات والأرباح، وبتظهر في توزيع الحالات بس
      </p>
    </div>
  );
}
