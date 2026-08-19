// ==========================================================================
// السعر اللي بيبيع — مقارنة بين سعرين لنفس المنتج
// --------------------------------------------------------------------------
// كل بند أوردر بيحفظ **السعر وقت البيع** (`sale_price_at_order`)، يعني تاريخ
// أسعارك كله موجود عندك من غير ما تسجّل حاجة. الملف ده بيقراه ويقول: المنتج
// ده اتباع بسعرين — أنهي واحد فيهم كان بيجيب فلوس أكتر **في اليوم**.
//
// ⚠️⚠️ **«في اليوم» هي كل الحكاية.** السعر القديم غالبًا يكون واخد شهور
// والجديد أسبوع، فمقارنة الإجمالي بتكسب للقديم دايمًا وهي مش بتقول حاجة.
//
// ⚠️ **ودي مقارنة مش تجربة.** لو غيّرت السعر في نفس وقت إعلان أو موسم،
// الفرق مش بتاع السعر. عشان كده بنرجّع **عدد الأيام** و**التواريخ** مع كل
// سعر — تبص عليهم وتحكم بنفسك — وبنرفع علم `overlapped` لو السعرين كانوا
// شغالين في نفس الوقت (ده خصم مش تغيير سعر، والمقارنة ساعتها مالهاش معنى).
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

/** الحالات اللي معناها البيعة ماحصلتش أصلًا */
const NOT_A_SALE = ["cancelled"];

/** الحالات اللي معناها البضاعة رجعت */
const CAME_BACK = ["returned", "returned_after_delivery"];

/**
 * ⚠️ **أقل من كده مايتقارنش.**
 *
 * سعر اتباع بيه ٣ مرات مايقدرش يتحاسب عليه. والأيام مهمة زي البيعات:
 * سعر عاش يومين ممكن يكون كل بيعاته من إعلان واحد.
 */
export const MIN_ORDERS_PER_PRICE = 5;
export const MIN_DAYS_PER_PRICE = 7;

/** فرق أقل من كده بين السعرين = نفس السعر عمليًا (تقريب/كسور) */
export const MIN_PRICE_GAP = 5;

/**
 * ⚠️⚠️ **السعر اللي هو مضاعف سعر تاني = باكِت مش سعر.**
 *
 * اتكشف على داتا حقيقية (١٩ أغسطس ٢٠٢٦): مقبض الستارة طالع بسعرين
 * ٦٤٩ و**١٢٩٨**، والتاني ده ظهر **٢١ مرة كلهم بكمية ١** — يعني العميل
 * خد قطعتين واتسجّلوا كقطعة بضعف السعر. من غير الحاجز ده الشاشة كانت
 * هتقول «السعر الأرخص بيكسب ٣٧٪ أكتر» وهي بتقارن قطعة بقطعتين.
 */
const PACK_MULTIPLES = [2, 3, 4, 5];
const PACK_TOLERANCE = 0.02;

function looksLikePack(low: number, high: number): boolean {
  return PACK_MULTIPLES.some(
    (k) => Math.abs(high - low * k) <= low * k * PACK_TOLERANCE
  );
}

export type PriceOrder = {
  orderDate: string | null;
  orderStatus: string | null;
  items: {
    variantId?: string | null;
    productName?: string | null;
    quantity: number;
    price: number;
  }[];
};

export type PricePoint = {
  price: number;
  /** كام أوردر اتباع فيهم بالسعر ده */
  orders: number;
  units: number;
  returnedOrders: number;
  /** أول وآخر يوم اتباع فيه بالسعر ده */
  from: string;
  to: string;
  /** طول الفترة بالأيام (يوم واحد = ١) */
  days: number;
  /** قطع في اليوم */
  unitsPerDay: number;
  /** جنيه في اليوم */
  revenuePerDay: number;
  /** نسبة الرجوع ٪ */
  returnRate: number;
};

export type PriceTest = {
  variantId: string;
  name: string;
  /** أعلى سعرين من حيث عدد البيعات، مرتبين بالسعر */
  low: PricePoint;
  high: PricePoint;
  /** السعر الأعلى بيجيب كام ٪ فلوس في اليوم مقارنة بالأقل */
  gainPercent: number;
  /** أنهي سعر بيكسب أكتر في اليوم */
  winner: "low" | "high";
  /**
   * السعرين كانوا شغالين في نفس الوقت؟ ⚠️ لو `true` ده خصم مش تغيير سعر،
   * والمقارنة مالهاش معنى.
   */
  overlapped: boolean;
};

function dayOf(value: string | null): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function spanDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

type Bucket = {
  orders: number;
  units: number;
  returnedOrders: number;
  revenue: number;
  from: string;
  to: string;
};

/**
 * كل منتج اتباع بأكتر من سعر — والمقارنة بينهم.
 *
 * بيرجّع الأكبر مكسبًا الأول عشان أول سطر يبقى هو اللي يستاهل تعمله حاجة.
 */
export function priceTests(orders: PriceOrder[]): PriceTest[] {
  // مفتاح الشكل → سعر → الحسبة
  const byVariant = new Map<string, { name: string; prices: Map<number, Bucket> }>();

  for (const o of orders) {
    if (NOT_A_SALE.includes(String(o.orderStatus))) continue;
    const day = dayOf(o.orderDate);
    if (!day) continue;
    const returned = CAME_BACK.includes(String(o.orderStatus));

    for (const item of o.items ?? []) {
      const id = String(item.variantId ?? "").trim();
      if (!id) continue;
      const price = Math.round(Number(item.price));
      if (!Number.isFinite(price) || price <= 0) continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      const v =
        byVariant.get(id) ??
        (() => {
          const fresh = { name: item.productName || "منتج", prices: new Map<number, Bucket>() };
          byVariant.set(id, fresh);
          return fresh;
        })();

      const b =
        v.prices.get(price) ??
        (() => {
          const fresh: Bucket = {
            orders: 0, units: 0, returnedOrders: 0, revenue: 0, from: day, to: day,
          };
          v.prices.set(price, fresh);
          return fresh;
        })();

      b.orders += 1;
      b.units += qty;
      b.revenue += qty * price;
      if (returned) b.returnedOrders += 1;
      if (day < b.from) b.from = day;
      if (day > b.to) b.to = day;
    }
  }

  const out: PriceTest[] = [];

  for (const [variantId, v] of byVariant) {
    const points = [...v.prices.entries()]
      .map(([price, b]) => toPoint(price, b))
      .filter((p) => p.orders >= MIN_ORDERS_PER_PRICE && p.days >= MIN_DAYS_PER_PRICE);

    if (points.length < 2) continue;

    // أشهر سعرين — مش أعلى وأقل سعر. الشاذ اللي اتباع ٦ مرات مايقارنش
    // السعر اللي عليه الشغل كله.
    const [a, b] = points.sort((x, y) => y.orders - x.orders).slice(0, 2);
    const low = a.price <= b.price ? a : b;
    const high = a.price <= b.price ? b : a;
    if (high.price - low.price < MIN_PRICE_GAP) continue;
    if (looksLikePack(low.price, high.price)) continue;

    const gain =
      low.revenuePerDay > 0
        ? ((high.revenuePerDay - low.revenuePerDay) / low.revenuePerDay) * 100
        : 0;

    out.push({
      variantId,
      name: v.name,
      low,
      high,
      gainPercent: Math.round(gain),
      winner: high.revenuePerDay >= low.revenuePerDay ? "high" : "low",
      overlapped: overlaps(low, high),
    });
  }

  return out.sort((x, y) => Math.abs(y.gainPercent) - Math.abs(x.gainPercent));
}

function toPoint(price: number, b: Bucket): PricePoint {
  const days = spanDays(b.from, b.to);
  return {
    price,
    orders: b.orders,
    units: b.units,
    returnedOrders: b.returnedOrders,
    from: b.from,
    to: b.to,
    days,
    unitsPerDay: b.units / days,
    revenuePerDay: b.revenue / days,
    returnRate: b.orders > 0 ? (b.returnedOrders / b.orders) * 100 : 0,
  };
}

/**
 * الفترتين متداخلتين؟
 *
 * التداخل البسيط طبيعي (يوم التغيير نفسه فيه الاتنين). اللي بيبطّل المقارنة
 * هو إن نص فترة من الاتنين تبقى جوّه التانية.
 */
function overlaps(a: PricePoint, b: PricePoint): boolean {
  const start = a.from > b.from ? a.from : b.from;
  const end = a.to < b.to ? a.to : b.to;
  if (start > end) return false;
  const shared = spanDays(start, end);
  return shared / Math.min(a.days, b.days) > 0.5;
}
