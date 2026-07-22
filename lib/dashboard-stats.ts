// حسابات كروت الداشبورد — مشتركة بين السيرفر (أول تحميل) والعميل (التحديث اللايف)
import { AT_CARRIER_STATUSES } from "./format";

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
  // تكلفة الشحن بتتحسب بعد ما المندوب يستلم — وبوسطة بتاخد فلوسها حتى في المرتجع
  const bostaChargedOrders = periodOrders.filter(
    (o) =>
      AT_CARRIER_STATUSES.includes(o.order_status ?? "") &&
      Number(o.bosta_shipping_cost ?? 0) > 0
  );
  const bostaShippingTotal = bostaChargedOrders.reduce(
    (s, o) => s + Number(o.bosta_shipping_cost ?? 0),
    0
  );
  // الـ90 بيتحصّل بس من اللي اتشحن/اتسلّم — المرتجع العميل مدفعش حاجة
  const shippedCount = bostaChargedOrders.filter(
    (o) => o.order_status !== "returned"
  ).length;
  const shippingRevenue = shippedCount * SHIPPING_CHARGE;
  // اللي دفعته من جيبك فوق الـ90 المحصّل — ده اللي بيتخصم من الربح
  const netShipping = bostaShippingTotal - shippingRevenue;
  // الشحن المحصّل مش بيتضاف للربح (محسوب ضمن توتال الأوردر) — بنخصم الزيادة بس
  const netProfit = profit - expensesTotal - netShipping;
  const orderCount = validOrders.length;
  const avgOrder = orderCount > 0 ? sales / orderCount : 0;

  // تحصيل بوسطة: مجموع COD الأوردرات اللي "تم تسليمها" في الفترة (حسب تاريخ التسليم)
  // بنعتمد على حالة التسليم مش على علم التحصيل من بوسطة (اللي بيتأخر)
  const cod = orders
    .filter((o) => {
      if (o.order_status !== "delivered" || !o.delivered_at) return false;
      const d = cairoDateOf(o.delivered_at);
      return d >= periodStart && d <= periodEnd;
    })
    .reduce((s, o) => {
      // قيمة التحصيل = COD بتاع بوسطة، ولو مش موجود نستخدم قيمة المنتجات بعد الخصم
      const value =
        Number(o.bosta_cod ?? 0) > 0
          ? Number(o.bosta_cod)
          : itemsTotal(o) - o.discount;
      return s + value;
    }, 0);

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
