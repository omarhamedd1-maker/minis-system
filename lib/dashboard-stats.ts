// حسابات كروت الداشبورد — مشتركة بين السيرفر (أول تحميل) والعميل (التحديث اللايف)

export const SHIPPING_CHARGE = 90; // اللي العميل بيدفعه شحن لكل أوردر
const EXCLUDED = ["cancelled", "returned"];

const cairoDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
});
export function cairoDateOf(value: string | Date) {
  return cairoDateFormat.format(
    typeof value === "string" ? new Date(value) : value
  );
}

export function shiftDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PeriodParams = { period?: string; from?: string; to?: string };

export function resolvePeriod({ period, from, to }: PeriodParams) {
  const today = cairoDateOf(new Date());
  const [year, month] = today.split("-").map(Number);
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const rangeFrom = isDate(from) ? from! : undefined;
  const rangeTo = isDate(to) ? to! : rangeFrom;

  let periodStart: string;
  let periodEnd = today;
  if (rangeFrom) {
    periodStart = rangeFrom;
    periodEnd = rangeTo!;
  } else if (period === "month") {
    periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  } else if (period === "3m") {
    periodStart = shiftDays(today, -89);
  } else if (period === "year") {
    periodStart = `${year}-01-01`;
  } else {
    periodStart = today; // النهارده (الافتراضي)
  }
  const fetchStart = shiftDays(periodStart, -1); // يوم زيادة لفرق التوقيت
  return { periodStart, periodEnd, fetchStart };
}

type OrderItem = {
  quantity: number;
  sale_price_at_order: number;
  cost_price_at_order: number;
};
export type StatOrder = {
  order_status: string | null;
  order_date: string | null;
  delivered_at: string | null;
  discount: number;
  bosta_shipping_cost: number | null;
  bosta_cod: number | null;
  bosta_collected: boolean | null;
  order_items: OrderItem[];
};
export type StatExpense = { amount: number };

export type Headline = {
  sales: number;
  profit: number;
  expensesTotal: number;
  shippingRevenue: number;
  shippedCount: number;
  bostaShippingTotal: number;
  netShipping: number;
  netProfit: number;
  cod: number;
  orderCount: number;
  avgOrder: number;
};

const itemsTotal = (o: StatOrder) =>
  o.order_items.reduce((s, i) => s + i.quantity * i.sale_price_at_order, 0);
const itemsProfit = (o: StatOrder) =>
  o.order_items.reduce(
    (s, i) => s + i.quantity * (i.sale_price_at_order - i.cost_price_at_order),
    0
  );

export function computeHeadline(
  orders: StatOrder[],
  expenses: StatExpense[],
  periodStart: string,
  periodEnd: string
): Headline {
  const day = (o: StatOrder) => (o.order_date ? cairoDateOf(o.order_date) : "");
  const periodOrders = orders.filter(
    (o) => day(o) >= periodStart && day(o) <= periodEnd
  );
  const validOrders = periodOrders.filter(
    (o) => !EXCLUDED.includes(o.order_status ?? "")
  );

  const sales = validOrders.reduce((s, o) => s + itemsTotal(o) - o.discount, 0);
  const profit = validOrders.reduce(
    (s, o) => s + itemsProfit(o) - o.discount,
    0
  );
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  // تكلفة الشحن بتتحسب بس بعد ما شركة الشحن تستلم الأوردر فعلاً
  const shippedOrders = validOrders.filter(
    (o) =>
      ["shipped", "delivered"].includes(o.order_status ?? "") &&
      Number(o.bosta_shipping_cost ?? 0) > 0
  );
  const shippedCount = shippedOrders.length;
  const shippingRevenue = shippedCount * SHIPPING_CHARGE;
  const bostaShippingTotal = shippedOrders.reduce(
    (s, o) => s + Number(o.bosta_shipping_cost ?? 0),
    0
  );
  // اللي دفعته من جيبك فوق الـ90 المحصّل — ده اللي بيتخصم من الربح
  const netShipping = bostaShippingTotal - shippingRevenue;
  // الشحن المحصّل مش بيتضاف للربح (محسوب ضمن توتال الأوردر) — بنخصم الزيادة بس
  const netProfit = profit - expensesTotal - netShipping;
  const orderCount = validOrders.length;
  const avgOrder = orderCount > 0 ? sales / orderCount : 0;

  // تحصيل بوسطة الفعلي: مجموع COD اللي اتحصّل فعلاً في الفترة (حسب تاريخ التسليم)
  const cod = orders
    .filter((o) => {
      if (!o.bosta_collected || !o.delivered_at) return false;
      const d = cairoDateOf(o.delivered_at);
      return d >= periodStart && d <= periodEnd;
    })
    .reduce((s, o) => s + Number(o.bosta_cod ?? 0), 0);

  return {
    sales,
    profit,
    expensesTotal,
    shippingRevenue,
    shippedCount,
    bostaShippingTotal,
    netShipping,
    netProfit,
    cod,
    orderCount,
    avgOrder,
  };
}
