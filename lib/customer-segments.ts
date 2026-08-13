// ==========================================================================
// شرايح العملاء — مين يستاهل معاملة مختلفة
// --------------------------------------------------------------------------
// «٢٩٨ عميل» رقم مابيقولش حاجة. اللي بيفرق إن العميل اللي بيدفع مقدم مش
// زي اللي بيرجّع كتير، واللي مااشترىش من ٤ شهور محتاج مكالمة مش خصم.
//
// **الشرايح مقفولة زي أسباب الرجوع.** لو كانت بتتكتب بالإيد، كل واحد
// هيعرّف «عميل مهم» بطريقته وتبقى قسمة مالهاش معنى.
//
// وكل شريحة معاها **إيه المختلف معاها** — الشريحة من غير تصرّف مالهاش
// لازمة، زي السبب من غير علاج.
//
// ⚠️ **الأوردر الملغي مايحسبش عميل.** لو دخل، اللي طلب ولغى بيبان زبون.
// ==========================================================================

import { isPrepaidMethod } from "./format";

/** الأوردر اللي بيتحسب: خرج فعلاً أو اتسلّم — الملغي لأ */
const COUNTED = [
  "confirmed",
  "packed",
  "ready",
  "shipped",
  "out_for_delivery",
  "delivered",
  "returning",
  "returned",
  "returned_after_delivery",
];

const RETURNED = ["returned", "returned_after_delivery"];

export type SegOrder = {
  customer_id: string | null;
  order_status: string | null;
  order_date: string | null;
  payment_method?: string | null;
  amount_paid?: number | null;
  discount: number;
  shipping_price?: number | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

export type CustomerStats = {
  customerId: string;
  orders: number;
  spend: number;
  aov: number;
  returned: number;
  returnRate: number;
  prepaid: number;
  lastOrder: string | null;
  daysSinceLast: number | null;
};

function total(o: SegOrder): number {
  const goods = o.order_items.reduce(
    (s, i) => s + i.quantity * i.sale_price_at_order,
    0
  );
  return goods - (o.discount ?? 0) + Number(o.shipping_price ?? 0);
}

function days(from: string, to: string): number {
  const a = Date.parse(from.slice(0, 10) + "T12:00:00Z");
  const b = Date.parse(to.slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function statsByCustomer(
  orders: SegOrder[],
  today: string
): CustomerStats[] {
  const map = new Map<string, CustomerStats>();

  for (const o of orders) {
    if (!o.customer_id) continue;
    if (!COUNTED.includes(o.order_status ?? "")) continue;

    const cur =
      map.get(o.customer_id) ??
      {
        customerId: o.customer_id,
        orders: 0,
        spend: 0,
        aov: 0,
        returned: 0,
        returnRate: 0,
        prepaid: 0,
        lastOrder: null,
        daysSinceLast: null,
      };

    cur.orders++;
    cur.spend += total(o);
    if (RETURNED.includes(o.order_status ?? "")) cur.returned++;
    // مدفوع مقدم: طريقة دفع **معروفة** مش كاش، أو دفع جزء قبل الشحن.
    // القيمة المجهولة بتتحسب كاش — اقرا `isPrepaidMethod` والسبب معاها.
    if (isPrepaidMethod(o.payment_method) || Number(o.amount_paid ?? 0) > 0) {
      cur.prepaid++;
    }
    if (o.order_date && (!cur.lastOrder || o.order_date > cur.lastOrder)) {
      cur.lastOrder = o.order_date;
    }

    map.set(o.customer_id, cur);
  }

  for (const c of map.values()) {
    c.spend = Math.round(c.spend * 100) / 100;
    c.aov = c.orders > 0 ? Math.round((c.spend / c.orders) * 100) / 100 : 0;
    c.returnRate = c.orders > 0 ? c.returned / c.orders : 0;
    c.daysSinceLast = c.lastOrder ? days(c.lastOrder, today) : null;
  }

  return [...map.values()];
}

export type SegmentKey =
  | "prepaid"
  | "high_aov"
  | "loyal"
  | "returner"
  | "dormant"
  | "new";

export type Segment = {
  key: SegmentKey;
  label: string;
  /** إيه المختلف مع الشريحة دي */
  play: string;
  customers: CustomerStats[];
  spend: number;
};

/**
 * حدود الشرايح.
 *
 * **مافيش رقم مقدّس هنا** — دي نقطة بداية معقولة على متجر بمئات
 * الأوردرات، وبتتظبط لما يبقى فيه داتا أكتر.
 */
export const THRESHOLDS = {
  /** أوردرين فأكتر = مكرر، تلاتة فأكتر = دايم */
  loyalOrders: 3,
  /** ضعف متوسط الأوردر العام */
  highAovFactor: 2,
  /** رجّع نص أوردراته فأكتر */
  returnRate: 0.5,
  /** عدّى ٩٠ يوم من آخر أوردر */
  dormantDays: 90,
};

/**
 * بيقسّم العملاء.
 *
 * **العميل ممكن يقع في أكتر من شريحة** — واحد بيدفع مقدم وأوردره عالي
 * مالوش سبب يتحط في واحدة ويتشال من التانية. القسمة هنا للتصرّف مش
 * لتصنيف نهائي.
 */
export function segmentCustomers(
  stats: CustomerStats[],
  overallAov: number
): Segment[] {
  const pick = (f: (c: CustomerStats) => boolean) => stats.filter(f);
  const sum = (list: CustomerStats[]) =>
    Math.round(list.reduce((s, c) => s + c.spend, 0) * 100) / 100;

  const defs: { key: SegmentKey; label: string; play: string; f: (c: CustomerStats) => boolean }[] =
    [
      {
        key: "prepaid",
        label: "بيدفع مقدم",
        play: "المنتج الغالي يتعرض عليهم الأول — دول مفيش خطر رجوع معاهم",
        f: (c) => c.prepaid > 0 && c.prepaid >= c.orders / 2,
      },
      {
        key: "high_aov",
        label: "متوسط أوردره عالي",
        play: `أوردره فوق ${Math.round(overallAov * THRESHOLDS.highAovFactor)} ج — يستاهل متابعة شخصية`,
        f: (c) => overallAov > 0 && c.aov >= overallAov * THRESHOLDS.highAovFactor,
      },
      {
        key: "loyal",
        label: "زبون دايم",
        play: `${THRESHOLDS.loyalOrders} أوردرات فأكتر — دول اللي بيعوّضوا تكلفة جذب العميل`,
        f: (c) => c.orders >= THRESHOLDS.loyalOrders,
      },
      {
        key: "returner",
        label: "بيرجّع كتير",
        play: "أكّد بالتليفون قبل الشحن — الشحنة الراجعة بتتحسب رسومها الاتجاهين",
        f: (c) => c.orders >= 2 && c.returnRate >= THRESHOLDS.returnRate,
      },
      {
        key: "dormant",
        label: "غاب من فترة",
        play: `مااشترىش من ${THRESHOLDS.dormantDays} يوم فأكتر — دول أرخص من عميل جديد`,
        f: (c) =>
          c.daysSinceLast !== null && c.daysSinceLast >= THRESHOLDS.dormantDays,
      },
      {
        key: "new",
        label: "اشترى مرة واحدة",
        play: "التانية هي اللي بتحوّله زبون — دي أكبر شريحة عادةً",
        f: (c) => c.orders === 1,
      },
    ];

  return defs.map((d) => {
    const customers = pick(d.f).sort((a, b) => b.spend - a.spend);
    return {
      key: d.key,
      label: d.label,
      play: d.play,
      customers,
      spend: sum(customers),
    };
  });
}

/** متوسط قيمة الأوردر على كل العملاء — أساس مقارنة «الأوردر العالي» */
export function overallAov(stats: CustomerStats[]): number {
  const orders = stats.reduce((s, c) => s + c.orders, 0);
  const spend = stats.reduce((s, c) => s + c.spend, 0);
  return orders > 0 ? Math.round((spend / orders) * 100) / 100 : 0;
}
