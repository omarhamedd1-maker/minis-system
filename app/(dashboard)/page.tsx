import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, orderStatusBadge } from "@/lib/format";
import { GroupedBars, HBarList, LineChart } from "@/components/charts";

type OrderRow = {
  id: string;
  order_status: string | null;
  order_date: string | null;
  delivered_at: string | null;
  shipping_price: number;
  customers: { full_name: string | null } | null;
  order_items: {
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
    product_variants: {
      id: string;
      variant_name: string | null;
      products: { name: string | null } | null;
    } | null;
  }[];
};

const WEEKDAYS = [
  "السبت",
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

// بتوقيت مصر — عشان الأوردرات متخزنة بالتوقيت العالمي
const cairoHourFormat = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "Africa/Cairo",
});
const cairoWeekdayFormat = new Intl.DateTimeFormat("ar-EG", {
  weekday: "long",
  timeZone: "Africa/Cairo",
});

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

export default async function StatsPage({
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

  const [ordersResult, expensesResult, variantsResult, deliveredTodayResult] =
    await Promise.all([
      supabase
        .from("orders")
        .select(
          `id, order_status, order_date, delivered_at, shipping_price, customers(full_name),
           order_items(quantity, sale_price_at_order, cost_price_at_order,
             product_variants(id, variant_name, products(name)))`
        )
        .gte("order_date", fetchStart)
        .limit(2000)
        .overrideTypes<OrderRow[]>(),
      supabase
        .from("expenses")
        .select("category, amount, expense_date")
        .gte("expense_date", periodStart)
        .limit(2000)
        .overrideTypes<
          { category: string; amount: number; expense_date: string }[]
        >(),
      supabase
        .from("product_variants")
        .select("id, variant_name, cost_price, sale_price, quantity_on_hand, products(name)")
        .overrideTypes<
          {
            id: string;
            variant_name: string | null;
            cost_price: number;
            sale_price: number;
            quantity_on_hand: number;
            products: { name: string | null } | null;
          }[]
        >(),
      // أوردرات اتسلمت النهارده — منها بنحسب تحصيل اليوم
      supabase
        .from("orders")
        .select("id, shipping_price, order_items(quantity, sale_price_at_order)")
        .eq("order_status", "delivered")
        .gte("delivered_at", today)
        .overrideTypes<
          {
            id: string;
            shipping_price: number;
            order_items: { quantity: number; sale_price_at_order: number }[];
          }[]
        >(),
    ]);

  if (ordersResult.error || expensesResult.error || variantsResult.error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل الداشبورد:{" "}
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

  // النهارده
  const todayValidOrders = allOrders.filter(
    (o) =>
      (o.order_date ?? "").slice(0, 10) === today &&
      !EXCLUDED.includes(o.order_status ?? "")
  );
  const todaySales = todayValidOrders.reduce((s, o) => s + itemsTotal(o), 0);
  const todayProfit = todayValidOrders.reduce((s, o) => s + itemsProfit(o), 0);
  const todayCollections = (deliveredTodayResult.data ?? []).reduce(
    (sum, order) =>
      sum +
      order.order_items.reduce(
        (s, item) => s + item.quantity * item.sale_price_at_order,
        0
      ) +
      order.shipping_price,
    0
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
  const excludedOrders = periodOrders.filter((o) =>
    EXCLUDED.includes(o.order_status ?? "")
  );
  const deliveryRate =
    periodOrders.length > 0
      ? Math.round((deliveredCount / periodOrders.length) * 100)
      : 0;
  const cancelRate =
    periodOrders.length > 0
      ? Math.round((excludedOrders.length / periodOrders.length) * 100)
      : 0;

  // الفرص الضايعة: قيمة الأوردرات الملغية والمرتجعة
  const lostValue = excludedOrders.reduce((s, o) => s + itemsTotal(o), 0);

  // العملاء المكررين
  const customerOrderCounts = new Map<string, number>();
  for (const order of validOrders) {
    const name = order.customers?.full_name ?? "غير معروف";
    customerOrderCounts.set(name, (customerOrderCounts.get(name) ?? 0) + 1);
  }
  const totalCustomers = customerOrderCounts.size;
  const repeatCustomers = [...customerOrderCounts.values()].filter(
    (c) => c > 1
  ).length;
  const repeatRate =
    totalCustomers > 0
      ? Math.round((repeatCustomers / totalCustomers) * 100)
      : 0;

  // نقطة التعادل: كام أوردر يغطي المصاريف
  const avgProfitPerOrder = orderCount > 0 ? profit / orderCount : 0;
  const breakEvenOrders =
    avgProfitPerOrder > 0 ? Math.ceil(expensesTotal / avgProfitPerOrder) : null;

  // متوسط زمن التوصيل: من تاريخ الأوردر لتاريخ التسليم
  const deliveryDurations = periodOrders
    .filter((o) => o.order_status === "delivered" && o.delivered_at && o.order_date)
    .map(
      (o) =>
        (new Date(o.delivered_at!).getTime() -
          new Date(o.order_date!).getTime()) /
        86400000
    )
    .filter((days) => days >= 0);
  const avgDeliveryDays =
    deliveryDurations.length > 0
      ? deliveryDurations.reduce((s, d) => s + d, 0) / deliveryDurations.length
      : null;

  // مبيعات أيام الأسبوع (بتوقيت مصر)
  const weekdaySales = new Map<string, number>(WEEKDAYS.map((d) => [d, 0]));
  for (const order of validOrders) {
    if (!order.order_date) continue;
    const day = cairoWeekdayFormat.format(new Date(order.order_date));
    weekdaySales.set(day, (weekdaySales.get(day) ?? 0) + itemsTotal(order));
  }
  const weekdayItems = WEEKDAYS.map((day) => ({
    label: day,
    value: weekdaySales.get(day) ?? 0,
    display: formatMoney(weekdaySales.get(day) ?? 0),
  }));

  // الأوردرات حسب ساعات اليوم (بتوقيت مصر)
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const order of validOrders) {
    if (!order.order_date) continue;
    const hour = Number(cairoHourFormat.format(new Date(order.order_date)));
    if (hour >= 0 && hour <= 23) hourCounts[hour] += 1;
  }
  const hourPoints = hourCounts.map((count, hour) => ({
    label:
      hour === 0
        ? "12ص"
        : hour < 12
          ? `${hour}ص`
          : hour === 12
            ? "12م"
            : `${hour - 12}م`,
    value: count,
    title: `الساعة ${hour}:00 — ${count} أوردر`,
  }));

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

  // نمو المبيعات: الشهر ده مقارنة بالشهر اللي فات (من شارت الشهور)
  const currentMonthSales = monthGroups[5]?.a ?? 0;
  const previousMonthSales = monthGroups[4]?.a ?? 0;
  const monthGrowth =
    previousMonthSales > 0
      ? Math.round(
          ((currentMonthSales - previousMonthSales) / previousMonthSales) * 100
        )
      : null;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">الداشبورد</h1>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(PERIODS).map(([key, p]) => (
            <Link
              key={key}
              href={`/?period=${key}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                period === key
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 shadow-sm hover:bg-gray-100"
              }`}
            >
              {p.label}
            </Link>
          ))}
          <a
            href="/export"
            className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          >
            تصدير Excel
          </a>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold text-gray-500">النهارده</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">مبيعات النهارده</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {formatMoney(todaySales)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">أرباح النهارده</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              {formatMoney(todayProfit)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">أوردرات النهارده</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {todayValidOrders.length}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">تحصيل النهارده (بوسطة)</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {formatMoney(todayCollections)}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-gray-500">
          {PERIODS[period].label}
        </h2>
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
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {orderCount}
            </p>
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
              {excludedOrders.length} من {periodOrders.length} أوردر
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">العملاء المكررين</p>
            <p className="mt-1 text-2xl font-bold text-sky-600">
              {repeatRate}%
            </p>
            <p className="text-xs text-gray-400">
              {repeatCustomers} من {totalCustomers} عميل اشتروا أكتر من مرة
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">فرص ضايعة (ملغي ومرتجع)</p>
            <p className="mt-1 text-2xl font-bold text-red-600">
              {formatMoney(lostValue)}
            </p>
            <p className="text-xs text-gray-400">
              {excludedOrders.length} أوردر ضاعوا
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">متوسط زمن التوصيل</p>
            {avgDeliveryDays === null ? (
              <p className="mt-1 text-sm text-gray-400">
                لسه مفيش تسليمات كفاية نحسب منها
              </p>
            ) : (
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {avgDeliveryDays < 1
                  ? "أقل من يوم"
                  : `${avgDeliveryDays.toFixed(1)} يوم`}
              </p>
            )}
            <p className="text-xs text-gray-400">
              من يوم الأوردر ليوم التسليم ({deliveryDurations.length} أوردر)
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">نمو المبيعات الشهري</p>
            {monthGrowth === null ? (
              <p className="mt-1 text-sm text-gray-400">
                محتاجين شهر كامل قبله عشان نقارن
              </p>
            ) : (
              <p
                className={`mt-1 text-2xl font-bold ${
                  monthGrowth >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {monthGrowth >= 0 ? "↑" : "↓"} {Math.abs(monthGrowth)}%
              </p>
            )}
            <p className="text-xs text-gray-400">
              الشهر ده مقارنة بالشهر اللي فات
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm sm:col-span-2">
            <p className="text-sm text-gray-500">نقطة التعادل</p>
            {breakEvenOrders === null ? (
              <p className="mt-1 text-sm text-gray-400">
                محتاجين أوردرات بأرباح الأول عشان نحسبها
              </p>
            ) : orderCount >= breakEvenOrders ? (
              <>
                <p className="mt-1 text-2xl font-bold text-green-600">
                  مصاريفك متغطية ✓
                </p>
                <p className="text-xs text-gray-400">
                  محتاج {breakEvenOrders} أوردر لتغطية المصاريف — حققت{" "}
                  {orderCount}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold text-orange-600">
                  فاضل {breakEvenOrders - orderCount} أوردر
                </p>
                <p className="text-xs text-gray-400">
                  محتاج {breakEvenOrders} أوردر لتغطية المصاريف — حققت{" "}
                  {orderCount} (بمتوسط ربح{" "}
                  {formatMoney(Math.round(avgProfitPerOrder))} للأوردر)
                </p>
              </>
            )}
          </div>
        </div>
      </section>

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
            مبيعات أيام الأسبوع ({PERIODS[period].label})
          </h2>
          <HBarList items={weekdayItems} />
          <p className="mt-3 text-xs text-gray-400">
            يفيدك في توقيت الإعلانات والعروض
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">
            الأوردرات حسب ساعات اليوم ({PERIODS[period].label})
          </h2>
          <LineChart points={hourPoints} valueSuffix=" أوردر" />
          <p className="mt-1 text-xs text-gray-400">
            بتوقيت مصر — يفيدك في توقيت البوستات والإعلانات
          </p>
        </div>
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
                  <th className="px-4 py-2.5 font-medium">هامش الربح</th>
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
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {stats.revenue > 0
                        ? Math.round((stats.profit / stats.revenue) * 100)
                        : 0}
                      %
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
        والمرتجعة مستبعدة من المبيعات والأرباح، وبتظهر في توزيع الحالات
        والفرص الضايعة بس
      </p>
    </div>
  );
}
