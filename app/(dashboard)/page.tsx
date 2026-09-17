import { upcomingSeasons, remainingText } from "@/lib/seasons";
import { createClient } from "@/lib/supabase/server";
import {
  EXCLUDED_STATUSES,
  LEGACY_BUCKET_PRODUCT,
  formatMoney,
  orderStatusBadge,
} from "@/lib/format";
import { GroupedBars, HBarList, LineChart } from "@/components/charts";
import { PeriodFilter } from "@/components/PeriodFilter";
import { resolvePeriod } from "@/lib/periods";
import { LiveMoneyCards } from "@/components/LiveMoneyCards";
import { computeHeadline } from "@/lib/dashboard-stats";
import { itemCost, itemKept, orderRefund } from "@/lib/returned-items";
import { countsInProfit } from "@/lib/profit-exclusions";
import { zeroCostMessage, zeroCostNote } from "@/lib/zero-cost";
import { monthlyReport } from "@/lib/monthly-report";
import { requirePagePermission } from "@/lib/permissions";
import { allRows } from "@/lib/fetch-all-pages";

type OrderRow = {
  id: string;
  order_status: string | null;
  order_date: string | null;
  delivered_at: string | null;
  shipping_price: number;
  discount: number;
  bosta_shipping_cost: number;
  bosta_fees_real: number | null;
  bosta_cod: number | null;
  bosta_collected: boolean | null;
  refunded_amount: number | null;
  refunded_at: string | null;
  customers: { full_name: string | null } | null;
  order_items: {
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
    returned_quantity: number | null;
    returned_condition: string | null;
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

const EXCLUDED = EXCLUDED_STATUSES;

function toDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// تاريخ اليوم بتوقيت مصر (السيرفر شغال بالتوقيت العالمي المتأخر عننا)
const cairoDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
});
function cairoDateOf(value: string | Date) {
  return cairoDateFormat.format(
    typeof value === "string" ? new Date(value) : value
  );
}

// إزاحة تاريخ بعدد أيام (على مستوى التقويم فقط)
function shiftDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ⚠️ **الريفند بيتطرح** — الأوردر اللي رجع بعد التسليم بيتحسب بيعة (ب)،
// والملغي والمرتجع قبل التسليم ريفندهم صفر فمابيتأثروش.
function itemsTotal(order: OrderRow) {
  return (
    order.order_items.reduce(
      (s, i) => s + i.quantity * i.sale_price_at_order,
      0
    ) - orderRefund(order)
  );
}

// والبضاعة اللي رجعت الرف تكلفتها مابتتحسبش — `lib/returned-items.ts`
function itemsProfit(order: OrderRow) {
  return (
    order.order_items.reduce(
      (s, i) => s + i.quantity * i.sale_price_at_order - itemCost(order, i),
      0
    ) - orderRefund(order)
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requirePagePermission("finance.dashboard");
  const query = await searchParams;

  // اليوم الحالي بتوقيت مصر مش بتوقيت السيرفر
  const today = cairoDateOf(new Date());
  const [todayYear, todayMonth] = today.split("-").map(Number);

  // ⚠️ **الفترة من `lib/periods`** — مصدر واحد لكل الصفحات (المرحلة ٢).
  // الافتراضي آخر ٣٠ يوم: «النهارده» في بيزنس بالدفع عند الاستلام بتوري
  // أوردرات من غير فلوسها. يوم واحد لسه متاح من «مدة مخصصة».
  const range = resolvePeriod(query, { today, defaultKey: "30d" });
  const periodStart = range.start ?? today;
  const periodEnd = range.end;
  const periodLabel = range.label;

  // بنجيب من أول 6 شهور فاتت عشان شارت مقارنة الشهور، مهما كانت الفترة المختارة
  const sixMonthsAgo = new Date(Date.UTC(todayYear, todayMonth - 1 - 5, 1))
    .toISOString()
    .slice(0, 10);
  const fetchStart = shiftDays(
    periodStart < sixMonthsAgo ? periodStart : sixMonthsAgo,
    -1 // يوم زيادة ورا عشان فرق التوقيت بين مصر والسيرفر
  );

  const supabase = await createClient();

  const [ordersResult, expensesResult, variantsResult] =
    await Promise.all([
      allRows(supabase
        .from("orders")
        .select(
          `id, order_status, order_date, delivered_at, shipping_price, discount, bosta_shipping_cost, bosta_fees_real, bosta_cod, bosta_collected, refunded_amount, refunded_at, customers(full_name),
           order_items(quantity, sale_price_at_order, cost_price_at_order, returned_quantity, returned_condition,
             product_variants(id, variant_name, products(name)))`
        )
        .gte("order_date", fetchStart)
        .overrideTypes<OrderRow[]>()),
      allRows(supabase
        .from("expenses")
        .select("category, amount, expense_date")
        // ⚠️ **بنجيب من `fetchStart` مش من `periodStart`** — الجدول الشهري
        // محتاج مصاريف الست شهور، والفلترة لكل شهر بتحصل جوّه التقرير.
        // والكروت فوق بتفلتر بالفترة بنفسها فمافيش تأثير عليها.
        .gte("expense_date", fetchStart)
        .overrideTypes<
          { category: string; amount: number; expense_date: string }[]
        >()),
      allRows(supabase
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
        >()),
    ]);

  if (ordersResult.error || expensesResult.error || variantsResult.error) {
    return (
      <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
        حصل خطأ أثناء تحميل الداشبورد:{" "}
        {ordersResult.error?.message ??
          expensesResult.error?.message ??
          variantsResult.error?.message}
      </div>
    );
  }

  const allOrders = ordersResult.data;
  // تاريخ كل أوردر بتوقيت مصر
  const orderDay = (o: OrderRow) =>
    o.order_date ? cairoDateOf(o.order_date) : "";
  const periodOrders = allOrders.filter(
    (o) => orderDay(o) >= periodStart && orderDay(o) <= periodEnd
  );
  const validOrders = periodOrders.filter(
    (o) =>
      !EXCLUDED.includes(o.order_status ?? "")
  );

  // أرقام الكروت المالية (أول تحميل) — بتتحدّث لايف في العميل
  const headline = computeHeadline(
    allOrders,
    // ⚠️ الكروت على الفترة المختارة، والمصاريف اتجابت أوسع عشان الجدول
    // الشهري — فبنفلترها هنا
    expensesResult.data.filter(
      (e) => e.expense_date >= periodStart && e.expense_date <= periodEnd
    ),
    periodStart,
    periodEnd
  );

  // ⚠️ **التقرير الشهري بينادي نفس حسبة الداشبورد** (`computeHeadline`)
  // مرة لكل شهر. لو اتكتبت حسبة تانية، كان هيبقى فيه رقمين مختلفين لنفس
  // الشهر في نفس الصفحة ومحدش يعرف مين الصح.
  //
  // **وبيتحسب على `allOrders`** مش على الفترة المختارة — الجدول ده عن
  // الاتجاه، مش عن الفلتر اللي فوق.
  const months = monthlyReport(
    allOrders as never,
    (expensesResult.data ?? []) as never,
    today,
    6
  );

  // الأرباح مبنية على تكلفة ناقصة؟ اقرا `lib/zero-cost.ts`
  const costNote = zeroCostMessage(
    zeroCostNote(
      allOrders.filter((o) => o.order_status === "delivered")
    )
  );
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

  // متوسط زمن التوصيل: من تاريخ الأوردر لتاريخ التسليم
  const deliveryDurations = periodOrders
    .filter((o) => o.order_status === "delivered" && o.delivered_at && o.order_date)
    .map(
      (o) =>
        (new Date(o.delivered_at!).getTime() -
          new Date(o.order_date!).getTime()) /
        86400000
    )
    // بنستبعد صفر (الأوردرات المستوردة اتحطلها نفس تاريخ الأوردر) والقيم الشاذة
    .filter((days) => days > 0 && days < 60);
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
  // يوم بيوم لحد ٣ شهور، وبعد كده شهر بشهر
  const daily = (range.days ?? 0) <= 92;
  const buckets = new Map<string, number>();
  if (daily) {
    const cursor = new Date(periodStart + "T00:00:00");
    while (toDateString(cursor) <= periodEnd) {
      buckets.set(toDateString(cursor), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    for (let m = 1; m <= todayMonth; m++) {
      buckets.set(`${todayYear}-${String(m).padStart(2, "0")}`, 0);
    }
  }
  for (const order of validOrders) {
    const date = orderDay(order).slice(0, daily ? 10 : 7);
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

  // ===== شارت المقارنة: بيتقسّم حسب الفترة المختارة =====
  // يوم واحد → بالساعات · لحد شهر → بالأيام · لحد 4 شهور → بالأسابيع · أكتر → بالشهور
  const daysInPeriod =
    Math.round(
      (new Date(periodEnd + "T12:00:00Z").getTime() -
        new Date(periodStart + "T12:00:00Z").getTime()) /
        86400000
    ) + 1;

  const bucketMode: "hour" | "day" | "week" | "month" =
    daysInPeriod <= 1
      ? "hour"
      : daysInPeriod <= 31
        ? "day"
        : daysInPeriod <= 120
          ? "week"
          : "month";

  const comparisonTitle =
    bucketMode === "hour"
      ? "المبيعات والأرباح بالساعة"
      : bucketMode === "day"
        ? "المبيعات والأرباح بالأيام"
        : bucketMode === "week"
          ? "المبيعات والأرباح بالأسابيع"
          : "المبيعات والأرباح بالشهور";

  // بنحسب مفتاح كل أوردر حسب طريقة التقسيم
  function bucketOf(o: OrderRow): string {
    const day = orderDay(o);
    if (bucketMode === "hour") {
      return cairoHourFormat.format(new Date(o.order_date!)).padStart(2, "0");
    }
    if (bucketMode === "day") return day;
    if (bucketMode === "month") return day.slice(0, 7);
    // أسبوع: بنرجّع أول يوم في الأسبوع (بالنسبة لبداية الفترة)
    const diff = Math.floor(
      (new Date(day + "T12:00:00Z").getTime() -
        new Date(periodStart + "T12:00:00Z").getTime()) /
        86400000
    );
    return String(Math.floor(diff / 7));
  }

  // بنبني قايمة الفترات الفاضية بالترتيب عشان الشارت يبان متصل
  const cmpBuckets: { key: string; label: string }[] = [];
  if (bucketMode === "hour") {
    for (let h = 0; h < 24; h += 2) {
      const k = String(h).padStart(2, "0");
      cmpBuckets.push({ key: k, label: `${h}:00` });
    }
  } else if (bucketMode === "day") {
    for (let i = 0; i < daysInPeriod; i++) {
      const d = shiftDays(periodStart, i);
      cmpBuckets.push({
        key: d,
        label: new Date(d + "T12:00:00Z").toLocaleDateString("ar-EG", {
          day: "numeric",
          month: "short",
        }),
      });
    }
  } else if (bucketMode === "week") {
    const weeks = Math.ceil(daysInPeriod / 7);
    for (let w = 0; w < weeks; w++) {
      cmpBuckets.push({ key: String(w), label: `أسبوع ${w + 1}` });
    }
  } else {
    const start = new Date(periodStart + "T12:00:00Z");
    const end = new Date(periodEnd + "T12:00:00Z");
    const months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) +
      1;
    for (let m = 0; m < months; m++) {
      const d = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1)
      );
      cmpBuckets.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString("ar-EG", { month: "short" }),
      });
    }
  }

  const monthGroups = cmpBuckets.map((b) => {
    const rows = validOrders.filter((o) => {
      // في وضع الساعات بنجمّع كل ساعتين مع بعض
      if (bucketMode === "hour") {
        const h = Number(bucketOf(o));
        return h >= Number(b.key) && h < Number(b.key) + 2;
      }
      return bucketOf(o) === b.key;
    });
    return {
      label: b.label,
      a: rows.reduce((s, o) => s + itemsTotal(o) - o.discount, 0),
      b: rows.reduce((s, o) => s + itemsProfit(o) - o.discount, 0),
    };
  });

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
      // المستثنى من الربح بيتعرض بس بيتقال — عشان مايتفهمش إنه متطرح
      label: countsInProfit(category) ? category : `${category} · مش في الربح`,
      value: amount,
      display: formatMoney(amount),
      color: "var(--primary-mid)",
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
      // اللي رجع من العميل مايتحسبش للمنتج — `itemKept`
      const kept = itemKept(order, item);
      entry.qty += kept.qty;
      entry.revenue += kept.revenue;
      entry.profit += kept.profit;
      productStats.set(name, entry);
    }
  }
  const topProducts = [...productStats.entries()]
    .filter(([name]) => name !== LEGACY_BUCKET_PRODUCT)
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

  // توقع قفلة الشهر: لو كملت بنفس معدل البيع اليومي
  const todayDayOfMonth = Number(today.split("-")[2]);
  const daysInMonth = new Date(todayYear, todayMonth, 0).getDate();
  const monthDailyRate =
    todayDayOfMonth > 0 ? currentMonthSales / todayDayOfMonth : 0;
  const projectedMonthSales = Math.round(monthDailyRate * daysInMonth);

  /**
   * المواسم اللي جاية في الشهرين الجايين.
   *
   * ⚠️ **من قايمة مكتوبة مش محسوبة** — رمضان والأعياد بالهجري وبيتقدّموا
   * كل سنة، فالقاعدة الثابتة بتغلط. ولما القايمة تخلص الملف بيسكت.
   */
  const seasons = upcomingSeasons(new Date(), 60);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">الداشبورد</h1>

      </div>

      <section>
        {/*
          الفترة على اليمين والمواسم الجاية على الشمال — نفس السطر.
          ⚠️ مفيش كلمة «الفترة» ولا عنوانها فوق: الشريحة المختارة هي اللي بتقول
          (قرار عمر ١٧ سبتمبر). والمواسم **سطر مش كارت** — تذكير بيعدّي.
        */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <PeriodFilter
            basePath="/"
            query={query}
            current={range}
            defaultKey="30d"
          />
          {seasons.length > 0 && (
            <p className="text-xs text-ink-muted">
              جاي:{" "}
              {seasons.map((s, i) => (
                <span key={s.key}>
                  {i > 0 && " · "}
                  <span className="text-ink">{s.name}</span>{" "}
                  <span className="text-ink-faint">
                    {remainingText(s.daysAway)}
                  </span>
                </span>
              ))}
            </p>
          )}
        </div>
        <LiveMoneyCards
          initial={headline}
          period={range.key === "custom" ? undefined : range.key}
          from={range.from}
          to={range.to}
        />

        {/*
          ⚠️ **الربح = سعر البيع − التكلفة.** لو التكلفة صفر، الربح بيطلع
          **مساوي للمبيعات** والكارت بيعرضه كأنه ربح حقيقي.

          ودي مش حالة نادرة: **شوبيفاي مافيهاش تكلفة**، فأي بيزنس جديد
          بيدخل بكل تكاليفه صفر. ٢ سِك دلوقتي **١٣١ من ١٣١** أوردر متسلّم
          بتكلفة صفر — يعني «ربح ٨٥٬٨٠٩ ج» هو المبيعات نفسها (١٨ أغسطس).

          **مابنغيّرش الرقم** — إحنا مانعرفش التكلفة. بنقول إنه مش ربح.
        */}
        {costNote && (
          <p className="mt-3 rounded-control bg-warning-soft px-4 py-2.5 text-xs text-warning">
            {costNote}
          </p>
        )}
        {/* 5 كروت نِسَب — صف واحد كامل على الكمبيوتر */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
            <p className="text-sm text-ink-muted">نسبة التسليم</p>
            <p className="mt-1 text-xl font-bold sm:text-2xl text-success">
              {deliveryRate}%
            </p>
            <p className="text-xs text-ink-faint">
              {deliveredCount} من {periodOrders.length} أوردر
            </p>
          </div>
          <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
            <p className="text-sm text-ink-muted">نسبة الإلغاء والمرتجع</p>
            <p className="mt-1 text-xl font-bold sm:text-2xl text-warning">
              {cancelRate}%
            </p>
            <p className="text-xs text-ink-faint">
              {excludedOrders.length} من {periodOrders.length} أوردر
            </p>
          </div>
          <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
            <p className="text-sm text-ink-muted">العملاء المكررين</p>
            <p className="mt-1 text-xl font-bold sm:text-2xl text-info">
              {repeatRate}%
            </p>
            <p className="text-xs text-ink-faint">
              {repeatCustomers} من {totalCustomers} عميل اشتروا أكتر من مرة
            </p>
          </div>
          <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
            <p className="text-sm text-ink-muted">فرص ضايعة (ملغي ومرتجع)</p>
            <p className="mt-1 text-xl font-bold sm:text-2xl text-danger">
              {formatMoney(lostValue)}
            </p>
            <p className="text-xs text-ink-faint">
              {excludedOrders.length} أوردر ضاعوا
            </p>
          </div>
          <div className="col-span-2 rounded-card bg-surface p-4 shadow-card sm:p-5 lg:col-span-1">
            <p className="text-sm text-ink-muted">متوسط زمن التوصيل</p>
            {avgDeliveryDays === null ? (
              <p className="mt-1 text-sm text-ink-faint">
                لسه مفيش تسليمات كفاية نحسب منها
              </p>
            ) : (
              <p className="mt-1 text-xl font-bold sm:text-2xl text-ink">
                {avgDeliveryDays < 1
                  ? "أقل من يوم"
                  : `${avgDeliveryDays.toFixed(1)} يوم`}
              </p>
            )}
            <p className="text-xs text-ink-faint">
              من يوم الأوردر ليوم التسليم ({deliveryDurations.length} أوردر)
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
            <p className="text-sm text-ink-muted">نمو المبيعات الشهري</p>
            {monthGrowth === null ? (
              <p className="mt-1 text-sm text-ink-faint">
                محتاجين شهر كامل قبله عشان نقارن
              </p>
            ) : (
              <p
                className={`mt-1 text-2xl font-bold ${
                  monthGrowth >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {monthGrowth >= 0 ? "↑" : "↓"} {Math.abs(monthGrowth)}%
              </p>
            )}
            <p className="text-xs text-ink-faint">
              الشهر ده مقارنة بالشهر اللي فات
            </p>
          </div>
          <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
            <p className="text-sm text-ink-muted">توقع قفلة الشهر</p>
            {currentMonthSales <= 0 ? (
              <p className="mt-1 text-sm text-ink-faint">
                لسه مفيش مبيعات الشهر ده نتوقع منها
              </p>
            ) : (
              <>
                <p className="mt-1 text-xl font-bold sm:text-2xl text-info">
                  ~{formatMoney(projectedMonthSales)}
                </p>
                <p className="text-xs text-ink-faint">
                  لو كملت بنفس المعدل ({formatMoney(Math.round(monthDailyRate))}{" "}
                  في اليوم) — فات {todayDayOfMonth} يوم من {daysInMonth}
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
        <h2 className="mb-3 text-sm font-bold text-ink">
          المبيعات {daily ? "يوم بيوم" : "شهر بشهر"} ({periodLabel})
        </h2>
        <LineChart points={timePoints} valueSuffix=" جنيه" />
      </div>

      <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
        <h2 className="mb-3 text-sm font-bold text-ink">
          {comparisonTitle}
        </h2>
        <GroupedBars groups={monthGroups} aLabel="المبيعات" bLabel="الأرباح" />
      </div>

      {/*
        التقرير الشهري — ورقة واحدة عن الاتجاه.

        الشارت فوق بيوري الشكل، والجدول ده بيوري الأرقام اللي بتتقال لشريك
        أو محاسب: بعت كام، صافي كام، رجع كام، والفرق عن الشهر اللي فات.
      */}
      <div className="overflow-x-auto rounded-card bg-surface p-4 shadow-card sm:p-5">
        <h2 className="mb-3 text-sm font-bold text-ink">آخر ٦ شهور</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-right text-ink-muted">
              <th className="px-3 py-2 font-medium">الشهر</th>
              <th className="px-3 py-2 font-medium">المبيعات</th>
              <th className="px-3 py-2 font-medium">صافي الربح</th>
              <th className="px-3 py-2 font-medium">الفرق</th>
              <th className="px-3 py-2 font-medium">أوردرات</th>
              <th className="px-3 py-2 font-medium">رجوع</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-medium text-ink">{m.label}</td>
                <td className="px-3 py-2 tabular-nums text-ink-body">{formatMoney(m.head.sales)}</td>
                <td className={`px-3 py-2 tabular-nums font-medium ${m.head.netProfit < 0 ? "text-danger" : "text-success"}`}>
                  {formatMoney(m.head.netProfit)}
                </td>
                <td className="px-3 py-2 tabular-nums text-xs">
                  {m.profitDelta === null ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    <span className={m.profitDelta < 0 ? "text-danger" : "text-success"}>
                      {m.profitDelta > 0 ? "+" : ""}
                      {formatMoney(m.profitDelta)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-ink-body">{m.head.orderCount}</td>
                <td className="px-3 py-2 tabular-nums text-ink-body">
                  {m.returnRate}% <span className="text-xs text-ink-faint">({m.returned})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
          <h2 className="mb-4 text-sm font-bold text-ink">
            مبيعات أيام الأسبوع ({periodLabel})
          </h2>
          <HBarList items={weekdayItems} />
          <p className="mt-3 text-xs text-ink-faint">
            يفيدك في توقيت الإعلانات والعروض
          </p>
        </div>
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">
            الأوردرات حسب ساعات اليوم ({periodLabel})
          </h2>
          <LineChart points={hourPoints} valueSuffix=" أوردر" />
          <p className="mt-1 text-xs text-ink-faint">
            بتوقيت مصر — يفيدك في توقيت البوستات والإعلانات
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
          <h2 className="mb-4 text-sm font-bold text-ink">
            حالات الأوردرات ({periodLabel})
          </h2>
          <HBarList items={statusItems} />
        </div>
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
          <h2 className="mb-4 text-sm font-bold text-ink">
            المصاريف بالنوع ({periodLabel})
          </h2>
          <HBarList items={expenseItems} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-card bg-surface shadow-card">
          <h2 className="border-b border-line px-5 py-4 text-sm font-bold text-ink">
            أفضل المنتجات ({periodLabel})
          </h2>
          {topProducts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-faint">
              مفيش مبيعات في الفترة دي
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-right text-ink-muted">
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
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {name}
                    </td>
                    <td className="px-4 py-2.5 text-ink-body">{stats.qty}</td>
                    <td className="px-4 py-2.5 text-ink-body">
                      {formatMoney(stats.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-success">
                      {formatMoney(stats.profit)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink">
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

        <div className="overflow-x-auto rounded-card bg-surface shadow-card">
          <h2 className="border-b border-line px-5 py-4 text-sm font-bold text-ink">
            أفضل العملاء ({periodLabel})
          </h2>
          {topCustomers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-faint">
              مفيش عملاء في الفترة دي
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-right text-ink-muted">
                  <th className="px-4 py-2.5 font-medium">العميل</th>
                  <th className="px-4 py-2.5 font-medium">الأوردرات</th>
                  <th className="px-4 py-2.5 font-medium">إجمالي المشتريات</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map(([name, stats]) => (
                  <tr
                    key={name}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {name}
                    </td>
                    <td className="px-4 py-2.5 text-ink-body">{stats.count}</td>
                    <td className="px-4 py-2.5 text-ink-body">
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
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
          <p className="text-sm text-ink-muted">قيمة المخزون الحالي (بالتكلفة)</p>
          <p className="mt-1 text-xl font-bold sm:text-2xl text-ink">
            {formatMoney(stockCostValue)}
          </p>
        </div>
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
          <p className="text-sm text-ink-muted">
            قيمة المخزون لو اتباع كله (بسعر البيع)
          </p>
          <p className="mt-1 text-xl font-bold sm:text-2xl text-ink">
            {formatMoney(stockSaleValue)}
          </p>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        كل الأرقام محسوبة لايف من الأوردرات والمصاريف — صافي الربح = أرباح
        المنتجات + الشحن المحصّل من العملاء − المصاريف − تكلفة شحن بوسطة
        الحقيقية. الأوردرات الملغية والمرتجعة مستبعدة من المبيعات والأرباح،
        وبتظهر في توزيع الحالات والفرص الضايعة بس
      </p>
    </div>
  );
}
