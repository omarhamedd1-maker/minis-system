// ==========================================================================
// يوم الشحن — هل اليوم اللي بتسلّم فيه بوسطة بيفرق؟
// --------------------------------------------------------------------------
// نفس الشحنة بنفس العميل ممكن توصل أو ترجع حسب اليوم اللي خرجت فيه. الخميس
// بيوصل الجمعة (إجازة عند ناس كتير)، والحاجة اللي بتخرج قبل عطلة بتقعد في
// مخزن بوسطة يومين زيادة، والقعدة الزيادة نفسها بتزوّد الرجوع.
//
// الملف ده بيقسّم شحناتك على **يوم الأسبوع اللي اتعملت فيه** (بتوقيت
// القاهرة) ويقول: نسبة التسليم كام، والرجوع كام، وقعدت كام يوم في الطريق.
//
// ⚠️⚠️ **اليوم اللي بنعدّ بيه هو `bosta_created_at` مش تاريخ الأوردر.**
// الأوردر ممكن يقعد عندك يومين قبل ما تعمله بوليصة — والسؤال هنا عن يوم
// **الشحن**، مش يوم البيع.
//
// ⚠️ **وده ارتباط مش سبب.** لو بتشحن معظم شحناتك يوم الأحد، الأحد هيبان
// عليه كل الحلو وكل الوحش. عشان كده بنرجّع **عدد الشحنات** مع كل يوم،
// واليوم اللي شحناته قليلة بيتشال أصلًا.
//
// **الملف ده صافي** — التوقيت بس هو اللي بيتنادى من `cairo-time`.
// ==========================================================================

import { cairoOffsetMinutes } from "./cairo-time";

/** الحالات اللي معناها الطرد خرج فعلًا وخلص مشواره */
const SETTLED = ["delivered", "returned", "returned_after_delivery"];
const CAME_BACK = ["returned", "returned_after_delivery"];

/**
 * ⚠️ **اليوم اللي شحناته أقل من كده مايتعرضش.**
 *
 * يوم فيه ٤ شحنات رجع منهم ٢ = ٥٠٪ رجوع، والرقم ده مالوش معنى — بس شكله
 * في الشاشة بيخوّف.
 */
export const MIN_SHIPMENTS_PER_DAY = 10;

/** أسماء أيام الأسبوع بترتيب `Date.getUTCDay()` — الأحد صفر */
export const WEEKDAYS = [
  "الأحد",
  "الاتنين",
  "التلات",
  "الأربع",
  "الخميس",
  "الجمعة",
  "السبت",
] as const;

export type TimingOrder = {
  orderStatus: string | null;
  bostaTracking?: string | null;
  bostaCreatedAt?: string | null;
  deliveredAt?: string | null;
};

export type DayRow = {
  /** ٠ = الأحد */
  day: number;
  name: string;
  shipped: number;
  delivered: number;
  returned: number;
  /** نسبة التسليم ٪ */
  deliveryRate: number;
  /** متوسط الأيام من الشحن للتسليم — `null` لو مفيش تسليم بتاريخ */
  leadDays: number | null;
};

export type TimingReport = {
  rows: DayRow[];
  /** نسبة التسليم العامة — عشان المقارنة يبقى ليها مرجع */
  overall: number;
  /** إجمالي الشحنات اللي دخلت الحساب */
  shipped: number;
  /** أحسن يوم وأوحش يوم — `null` لو الأيام المؤهّلة أقل من اتنين */
  best: DayRow | null;
  worst: DayRow | null;
};

/** يوم الأسبوع بتوقيت القاهرة — و`null` لو التاريخ مش مقروء */
export function cairoWeekday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const shifted = new Date(at.getTime() + cairoOffsetMinutes(at) * 60_000);
  return shifted.getUTCDay();
}

/**
 * الشحن حسب يوم الأسبوع.
 *
 * ⚠️ **الشحنة اللي لسه في الطريق مش داخلة** — لسه ماتعرفش هتوصل ولا لأ،
 * ولو اتحسبت هتنزّل نسبة تسليم آخر أسبوع كذب.
 */
export function shippingByDay(orders: TimingOrder[]): TimingReport {
  const buckets = WEEKDAYS.map((name, day) => ({
    day,
    name,
    shipped: 0,
    delivered: 0,
    returned: 0,
    leadSum: 0,
    leadCount: 0,
  }));

  for (const o of orders) {
    if (!String(o.bostaTracking ?? "").trim()) continue;
    if (!SETTLED.includes(String(o.orderStatus))) continue;
    const day = cairoWeekday(o.bostaCreatedAt);
    if (day === null) continue;

    const b = buckets[day];
    b.shipped += 1;

    if (CAME_BACK.includes(String(o.orderStatus))) {
      b.returned += 1;
    } else {
      b.delivered += 1;
      const lead = leadDays(o.bostaCreatedAt, o.deliveredAt);
      if (lead !== null) {
        b.leadSum += lead;
        b.leadCount += 1;
      }
    }
  }

  const rows: DayRow[] = buckets.map((b) => ({
    day: b.day,
    name: b.name,
    shipped: b.shipped,
    delivered: b.delivered,
    returned: b.returned,
    deliveryRate: b.shipped > 0 ? (b.delivered / b.shipped) * 100 : 0,
    leadDays: b.leadCount > 0 ? b.leadSum / b.leadCount : null,
  }));

  const shipped = rows.reduce((s, r) => s + r.shipped, 0);
  const delivered = rows.reduce((s, r) => s + r.delivered, 0);

  const eligible = rows
    .filter((r) => r.shipped >= MIN_SHIPMENTS_PER_DAY)
    .sort((a, b) => b.deliveryRate - a.deliveryRate);

  return {
    rows,
    shipped,
    overall: shipped > 0 ? (delivered / shipped) * 100 : 0,
    best: eligible.length >= 2 ? eligible[0] : null,
    worst: eligible.length >= 2 ? eligible[eligible.length - 1] : null,
  };
}

function leadDays(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const diff = (b - a) / 86_400_000;
  // التسليم قبل الشحن معناه تاريخ متلخبط — يتشال بدل ما ينزّل المتوسط
  return diff < 0 ? null : diff;
}
