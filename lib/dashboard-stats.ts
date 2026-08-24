// حسابات كروت الداشبورد — مشتركة بين السيرفر (أول تحميل) والعميل (التحديث اللايف)
import { AT_CARRIER_STATUSES, EXCLUDED_STATUSES } from "./format";

// ملحوظة: الشحن اللي العميل بيدفعه مابقاش رقم ثابت — بيتقرا من كل أوردر
// زي ما نزل من شوبيفاي، فلو اختلف من أوردر للتاني الحسبة تفضل صح.
const EXCLUDED = EXCLUDED_STATUSES;

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
  shipping_price?: number | null;
  bosta_shipping_cost: number | null;
  /** الرقم الحقيقي من كشف بوسطة — بيكسب على التقدير لما يكون موجود */
  bosta_fees_real?: number | null;
  bosta_cod: number | null;
  bosta_collected: boolean | null;
  order_items: OrderItem[];
};

/**
 * تكلفة بوسطة على الأوردر.
 *
 * **الحقيقي بيكسب على التقدير.** بوسطة بترجّع كشف حساب مفصّل باللي خدته
 * فعلًا بعد ما الشحنة تخلص، وده بيتخزّن في `bosta_fees_real`. التقدير
 * (`bosta_shipping_cost`) بيفضل للشحنة اللي لسه شغالة، لأن بوسطة مابتقفلش
 * الحساب غير بعد ما تخلص.
 *
 * الفرق مش بسيط: أوردر ١٠٧٤ تقديره ٣٧٫٦٢ والحقيقي ١٣٥٫٦٦، لأن الباقة
 * ماغطّتش شحنه — وده اللي التقدير مش شايفه.
 */
export function orderCarrierCost(o: {
  bosta_shipping_cost: number | null;
  bosta_fees_real?: number | null;
}): number {
  const real = Number(o.bosta_fees_real ?? 0);
  if (real > 0) return real;
  return Number(o.bosta_shipping_cost ?? 0);
}

export type ShippingSettlement = {
  /** اللي بوسطة خصمته فعلاً على الشحنة دي (كاش خرج) */
  cost: number;
  /**
   * نصيب الشحنة من الباقة — الشحن اللي الباقة دفعته بدالك.
   *
   * **صفر لو الباقة ماغطّتش**، لأن الشحن ساعتها جوّه `cost` خلاص.
   */
  bundleShare: number;
  /** التكلفة الكاملة = اللي خرج + اللي الباقة دفعته */
  full: number;
  /** اللي العميل دفعه شحن — صفر لو ماستلمش */
  paidByCustomer: number;
  /** موجب = الشحن عليك · سالب = زيادة معاك · صفر = متعادل */
  net: number;
  /** الرقم ده من كشف بوسطة ولا لسه تقدير */
  real: boolean;
};

/**
 * تسوية شحن الأوردر الواحد: كلّفك كام، والعميل دفع كام، والفرق لصالح مين.
 *
 * **الباج الأول** (شاشة الأوردر، ٦ أغسطس ٢٠٢٦): الصفحة كانت بتطرح ٨٨
 * «دفعته الباقة» من الرقم الحقيقي — والرقم الحقيقي اللي بوسطة بتقوله
 * **خصم الباقة متطرح منه جوّه أصلاً** (`bundleCovered`). فأوردر شحنه ٩٣
 * والباقة غطّته بيرجع بـ٣٤٫٢، والصفحة كانت تطرح ٨٨ تاني وتطرح ٩٠ بتاع
 * العميل وتقول **«بترجع لك ١٤٣٫٨»** — فلوس مالهاش وجود.
 *
 * **والباج التاني اللي ظهر بعد التصليح**: الشحنة اللي الباقة غطّتها بتبان
 * أرخص بمية جنيه من اللي ماغطّتهاش، مش لأنها أرخص فعلاً — لأن شحنها اتدفع
 * من الباقة فاختفى من الحسبة. أوردر ١٠٧٤ (ماغطّاش) تكلفته ١٣٥٫٦٦ وأوردر
 * الباقة غطّته تكلفته ٣٤٫٢ — نفس الخدمة تقريبًا.
 *
 * فبقينا نجمع نصيب الشحنة من الباقة (`bundleShare`) في **`full`**، وده
 * اللي الشاشة بتحكم بيه. و**`cost` سابته زي ما هو** = `orderCarrierCost`،
 * وهو اللي الأرباح بتتحسب بيه: قسط الباقة الشهري متسجّل مصروف بإيد عمر،
 * فلو اتحسب على الأوردر كمان يبقى مدفوع مرتين.
 */
export function shippingSettlement(input: {
  feesReal: number | null | undefined;
  feesEstimate: number | null | undefined;
  /**
   * الشحن اللي بوسطة كتبته على الشحنة دي (`bosta_ship_fee_real`).
   * لو الباقة غطّته، ده نصيب الشحنة منها — والرقم بييجي من بوسطة نفسها
   * لكل شحنة على حدة، فمش مهم إن الباقة بتتغيّر من شهر للتاني.
   */
  shipFeeReal: number | null | undefined;
  /** الباقة غطّت الشحنة دي؟ (`bundleCovered`) */
  bundleCovered: boolean;
  shippingPrice: number | null | undefined;
  /** العميل استلم فعلاً؟ من غير كده مافيش شحن اتحصّل منه */
  customerReceived: boolean;
}): ShippingSettlement {
  const cost = orderCarrierCost({
    bosta_shipping_cost: input.feesEstimate ?? null,
    bosta_fees_real: input.feesReal ?? null,
  });

  // **الباقة ماغطّتش؟ نصيبها صفر** — الشحن جوّه `cost` خلاص، وجمعه تاني
  // بيحسبه مرتين
  const bundleShare = input.bundleCovered
    ? Math.max(0, Number(input.shipFeeReal ?? 0))
    : 0;

  const full = round2(cost + bundleShare);
  const paidByCustomer = input.customerReceived
    ? Math.max(0, Number(input.shippingPrice ?? 0))
    : 0;

  return {
    cost,
    bundleShare,
    full,
    paidByCustomer,
    net: round2(full - paidByCustomer),
    real: Number(input.feesReal ?? 0) > 0,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type StatExpense = { amount: number };

export type Headline = {
  sales: number;
  /**
   * كل الأوردرات من غير فلتر حالة — بالملغي والمرتجع كمان.
   *
   * المبيعات بتقفّي الملغي والمرتجع عشان تمثل فلوس حقيقية، والرقم ده
   * بيوري حجم الحركة كله في الفترة زي ما شوبيفاي شايفاه.
   */
  grossSales: number;
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
    (o) =>
      !EXCLUDED.includes(o.order_status ?? "")
  );

  // المبيعات شاملة الشحن اللي العميل دفعه — عشان الرقم يقارن بشوبيفاي على طول
  const sales = validOrders.reduce(
    (s, o) => s + itemsTotal(o) - o.discount + Number(o.shipping_price ?? 0),
    0
  );
  // ⚠️ **الإجمالي من غير فلتر حالة** — نفس معادلة المبيعات بالظبط، بس على
  // كل الأوردرات اللي اتعملت في الفترة: الملغي والمرتجع كمان. الفرق بينه
  // وبين `sales` هو بالظبط قيمة اللي اتلغى أو رجع.
  const grossSales = periodOrders.reduce(
    (s, o) => s + itemsTotal(o) - o.discount + Number(o.shipping_price ?? 0),
    0
  );
  const profit = validOrders.reduce(
    (s, o) => s + itemsProfit(o) - o.discount,
    0
  );
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  // تكلفة الشحن بتتحسب بعد ما المندوب يستلم — وبوسطة بتاخد فلوسها حتى في المرتجع
  const bostaChargedOrders = periodOrders.filter(
    (o) =>
      AT_CARRIER_STATUSES.includes(o.order_status ?? "") &&
      orderCarrierCost(o) > 0
  );
  const bostaShippingTotal = bostaChargedOrders.reduce(
    (s, o) => s + orderCarrierCost(o),
    0
  );
  // الشحن اللي العميل دفعه — بنجمعه من الأوردرات نفسها زي ما نزل من شوبيفاي،
  // مش رقم ثابت. كده لو الشحن اختلف من أوردر للتاني الحسبة تفضل صح.
  // المرتجع مابيتحسبش — العميل مدفعش حاجة.
  const shippedOrders = bostaChargedOrders.filter(
    (o) => o.order_status !== "returned"
  );
  const shippedCount = shippedOrders.length;
  const shippingRevenue = shippedOrders.reduce(
    (s, o) => s + Number(o.shipping_price ?? 0),
    0
  );
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
    grossSales,
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

/**
 * عدّاد أوردرات الفترة لكل حالة — للشريط الملون فوق كروت الداشبورد.
 *
 * صحة البيع بتتبان من التوزيع من غير قراية: كتير «ملغي» أو «مرتجع»
 * بيبان أحمر من أول بصة.
 */
export function statusCounts(
  orders: StatOrder[],
  periodStart: string,
  periodEnd: string
): { status: string; count: number }[] {
  const day = (o: StatOrder) => (o.order_date ? cairoDateOf(o.order_date) : "");
  const counts = new Map<string, number>();
  for (const o of orders) {
    const d = day(o);
    if (d < periodStart || d > periodEnd) continue;
    const s = o.order_status ?? "new";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

export type DayPoint = { day: string; value: number };

/**
 * مبيعات كل يوم لآخر N يوم — لخط الميلان تحت رقم المبيعات.
 *
 * بنفس معادلة المبيعات بالظبط (بنود − خصم + شحن) على الحالات الصافية،
 * والأيام اللي مافيش فيها بيع بتترجع **صفر مش ماتحذفش** — الفجوة في
 * الخط هي المعلومة.
 */
export function dailySalesSeries(
  orders: StatOrder[],
  days: number,
  today: string
): DayPoint[] {
  const start = shiftDays(today, -(days - 1));
  const totals = new Map<string, number>();
  for (const o of orders) {
    if (!o.order_date) continue;
    if (EXCLUDED.includes(o.order_status ?? "")) continue;
    const d = cairoDateOf(o.order_date);
    if (d < start || d > today) continue;
    const v =
      o.order_items.reduce((s, i) => s + i.quantity * i.sale_price_at_order, 0) -
      o.discount +
      Number(o.shipping_price ?? 0);
    totals.set(d, (totals.get(d) ?? 0) + v);
  }
  const out: DayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDays(start, i);
    out.push({ day: d, value: Math.round((totals.get(d) ?? 0) * 100) / 100 });
  }
  return out;
}
