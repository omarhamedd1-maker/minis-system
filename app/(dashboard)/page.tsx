import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";

type OrderForStats = {
  id: string;
  order_status: string | null;
  order_date: string | null;
  order_items: {
    quantity: number;
    sale_price_at_order: number;
    cost_price_at_order: number;
  }[];
};

// الأوردرات الملغية والمرتجعة لا تُحسب في المبيعات ولا الأرباح
const EXCLUDED_STATUSES = ["cancelled", "returned"];

function orderTotals(orders: OrderForStats[]) {
  let sales = 0;
  let profit = 0;
  let count = 0;
  for (const order of orders) {
    if (EXCLUDED_STATUSES.includes(order.order_status ?? "")) continue;
    count += 1;
    for (const item of order.order_items) {
      sales += item.quantity * item.sale_price_at_order;
      profit +=
        item.quantity * (item.sale_price_at_order - item.cost_price_at_order);
    }
  }
  return { sales, profit, count };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthStart = `${year}-${month}-01`;
  const today = `${year}-${month}-${String(now.getDate()).padStart(2, "0")}`;

  const [ordersResult, expensesResult, missingCostResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_status, order_date, order_items(quantity, sale_price_at_order, cost_price_at_order)"
      )
      .gte("order_date", monthStart)
      .overrideTypes<OrderForStats[]>(),
    supabase
      .from("expenses")
      .select("amount, expense_date")
      .gte("expense_date", monthStart)
      .overrideTypes<{ amount: number; expense_date: string }[]>(),
    supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("cost_price", 0),
  ]);

  if (ordersResult.error || expensesResult.error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        حصل خطأ أثناء تحميل الداشبورد:{" "}
        {ordersResult.error?.message ?? expensesResult.error?.message}
      </div>
    );
  }

  const monthOrders = ordersResult.data;
  const todayOrders = monthOrders.filter(
    (order) => (order.order_date ?? "").slice(0, 10) === today
  );

  const monthStats = orderTotals(monthOrders);
  const todayStats = orderTotals(todayOrders);

  const monthExpenses = expensesResult.data.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );
  const netProfit = monthStats.profit - monthExpenses;
  const missingCostCount = missingCostResult.count ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">الداشبورد</h1>

      {missingCostCount > 0 && (
        <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          تنبيه: فيه {missingCostCount} شكل منتج تكلفته صفر، فأرقام الأرباح هنا
          أعلى من الحقيقة.{" "}
          <Link href="/products" className="font-bold underline">
            ادخل التكلفة من هنا
          </Link>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold text-gray-500">النهارده</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">مبيعات النهارده</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {formatMoney(todayStats.sales)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">أرباح النهارده</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              {formatMoney(todayStats.profit)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">أوردرات النهارده</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {todayStats.count}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-gray-500">الشهر ده</h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">مبيعات الشهر</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {formatMoney(monthStats.sales)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">أرباح الشهر</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              {formatMoney(monthStats.profit)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">أوردرات الشهر</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {monthStats.count}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">مصاريف الشهر</p>
            <p className="mt-1 text-2xl font-bold text-red-600">
              {formatMoney(monthExpenses)}
            </p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">صافي ربح الشهر</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                netProfit >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatMoney(netProfit)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          صافي الربح = أرباح المنتجات (البيع ناقص التكلفة) ناقص مصاريف الشهر —
          الأوردرات الملغية والمرتجعة مش محسوبة
        </p>
      </section>
    </div>
  );
}
