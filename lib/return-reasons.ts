// ==========================================================================
// أسباب رجوع الشحنة
// --------------------------------------------------------------------------
// نسبة الرجوع في مينيز **١٧٪** وقيمة البضاعة الراجعة **٨٣ ألف جنيه**.
// الرقم ده لوحده مابيقولش تعمل إيه — والسبب هو اللي بيقول:
//
//   • عنوان مش واضح  →  نظّف العناوين ساعة التأكيد
//   • العميل مش بيرد   →  اتصل قبل ما تشحن
//   • غيّر رأيه        →  مشكلة في وصف المنتج أو صوره
//   • خارج التغطية     →  اقفل المنطقة دي أو غيّر شركة الشحن
//
// **القايمة مقفولة بقصد.** لو الخانة نص حر، كل واحد هيكتب بطريقته
// («مردش» · «مش بيرد» · «لا يرد») وتبقى إحصائية مالهاش لازمة.
//
// وفيه «سبب تاني» عشان اللي مايتصنّفش مايتحشرش في خانة غلط ويلوّث الأرقام.
// ==========================================================================

export type ReturnReason = {
  value: string;
  label: string;
  /** اللي المفروض تعمله لما السبب ده يتكرر */
  fix: string;
};

export const RETURN_REASONS: ReturnReason[] = [
  {
    value: "unclear_address",
    label: "العنوان مش واضح",
    fix: "نظّف العنوان ساعة التأكيد — اسأل عن علامة مميزة ورقم الدور",
  },
  {
    value: "no_answer",
    label: "العميل مش بيرد",
    fix: "اتصل وأكّد قبل ما تبعت الشحنة",
  },
  {
    value: "changed_mind",
    label: "غيّر رأيه",
    fix: "راجع صور المنتج ووصفه — التوقّع غالبًا مختلف عن اللي وصل",
  },
  {
    value: "out_of_coverage",
    label: "خارج نطاق التغطية",
    fix: "اقفل المنطقة دي أو استخدم شركة شحن تانية فيها",
  },
  {
    value: "refused_on_delivery",
    label: "رفض الاستلام",
    fix: "اسأل المندوب عن السبب — غالبًا سعر مختلف أو كارتونة مفتوحة",
  },
  {
    value: "postponed_too_long",
    label: "أجّل كتير لحد ما رجعت",
    fix: "حدّد عدد محاولات ثابت وبعده ارجّع بدل ما البضاعة تفضل برّه",
  },
  {
    value: "damaged",
    label: "المنتج وصل تالف",
    fix: "راجع التغليف — دي خسارة مضاعفة (شحن الاتجاهين + بضاعة)",
  },
  {
    value: "other",
    label: "سبب تاني",
    fix: "لو ده بيتكرر كتير، يبقى محتاجين سبب جديد في القايمة",
  },
];

const BY_VALUE = new Map(RETURN_REASONS.map((r) => [r.value, r]));

export function returnReasonLabel(value: string | null | undefined): string {
  if (!value) return "مااتسجّلش";
  return BY_VALUE.get(value)?.label ?? value;
}

export function isReturnReason(value: string | null | undefined): boolean {
  return Boolean(value && BY_VALUE.has(value));
}

/** الحالات اللي السبب بيتسأل عليها — غيرها مافيش رجوع أصلًا */
export const RETURNED_STATUSES = ["returned", "returned_after_delivery"];

export type ReasonCount = {
  value: string;
  label: string;
  fix: string;
  count: number;
  /** قيمة البضاعة اللي رجعت بالسبب ده */
  amount: number;
  /** نسبته من الراجع اللي **اتسجّل** سببه */
  share: number;
};

export type ReasonBreakdown = {
  rows: ReasonCount[];
  /** رجع ومااتسجّلش سببه — بيتعرض لوحده مش بيتقسّم على الباقي */
  unknown: number;
  /** كل الراجع */
  total: number;
};

export type ReturnedOrder = {
  order_status: string | null;
  return_reason?: string | null;
  discount: number;
  shipping_price?: number | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

function value(o: ReturnedOrder): number {
  const goods = o.order_items.reduce(
    (s, i) => s + i.quantity * i.sale_price_at_order,
    0
  );
  return goods - (o.discount ?? 0) + Number(o.shipping_price ?? 0);
}

/**
 * توزيع أسباب الرجوع.
 *
 * ⚠️ **اللي مااتسجّلش سببه بيتعرض لوحده ومابيدخلش في النسب.** لو قسمناه
 * على الأسباب المعروفة، الأرقام هتبان أدق مما هي، والقرار هيتبني على وهم.
 * والرقم ده مفيد في ذاته: لو كبير يبقى الفريق مش بيسجّل.
 */
export function breakdownReturnReasons(
  orders: ReturnedOrder[]
): ReasonBreakdown {
  const counts = new Map<string, { count: number; amount: number }>();
  let unknown = 0;
  let total = 0;

  for (const o of orders) {
    if (!RETURNED_STATUSES.includes(o.order_status ?? "")) continue;
    total++;
    if (!isReturnReason(o.return_reason)) {
      unknown++;
      continue;
    }
    const key = o.return_reason as string;
    const cur = counts.get(key) ?? { count: 0, amount: 0 };
    cur.count++;
    cur.amount += value(o);
    counts.set(key, cur);
  }

  const known = total - unknown;
  const rows: ReasonCount[] = [];
  for (const r of RETURN_REASONS) {
    const c = counts.get(r.value);
    if (!c) continue;
    rows.push({
      value: r.value,
      label: r.label,
      fix: r.fix,
      count: c.count,
      amount: Math.round(c.amount * 100) / 100,
      share: known > 0 ? Math.round((c.count / known) * 100) : 0,
    });
  }
  rows.sort((a, b) => b.count - a.count);

  return { rows, unknown, total };
}
