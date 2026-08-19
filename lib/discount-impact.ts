// ==========================================================================
// الخصم كسّب ولا خسّر
// --------------------------------------------------------------------------
// الخصم بيتخصم من كل أوردر ومحدش بيرجع يسأل **جاب إيه**. والسؤال ليه إجابة
// من الداتا اللي عندك خلاص: الأوردر اللي فيه خصم بيبقى أكبر؟ بيرجع أقل ولا
// أكتر؟ وصافي اللي دخل منه بعد الخصم قد إيه؟
//
// ⚠️⚠️ **الخصم بيخلّي الأوردر يبان أكبر بشكل كاذب لو حسبناه غلط.** الإجمالي
// هنا هو **اللي العميل دفعه فعلًا** (بنود − خصم + شحن)، مش قيمة البضاعة قبل
// الخصم. الفرق ده هو الفرق بين «الخصم بيزوّد الأوردر ٢٠٪» و«الخصم بياكل ٢٠٪».
//
// ⚠️ **والملغي بره الحسبة** — مش بيعة أصلًا.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

const CANCELLED = ["cancelled"];
const SETTLED = ["delivered", "returned", "returned_after_delivery"];
const RETURNED = ["returned", "returned_after_delivery"];

/** أقل عدد أوردرات في المجموعة عشان المقارنة يبقى ليها معنى */
export const MIN_ORDERS_PER_GROUP = 5;

export type DiscountOrder = {
  orderStatus: string | null;
  /** قيمة البضاعة قبل الخصم */
  itemsTotal: number;
  discount: number;
  shipping: number;
  /** كود الخصم لو اتسجّل — بيتجاب من شوبيفاي مع الأوردر */
  code?: string | null;
};

export type DiscountGroup = {
  orders: number;
  /** اللي العميل دفعه فعلًا */
  revenue: number;
  /** متوسط الأوردر */
  average: number;
  /** إجمالي الخصم اللي اتخصم */
  discount: number;
  settled: number;
  returned: number;
  /** نسبة الرجوع ٪ — و`null` لو مفيش أوردر خلص */
  returnRate: number | null;
};

export type DiscountReport = {
  withDiscount: DiscountGroup;
  without: DiscountGroup;
  /** المقارنة ليها معنى؟ المجموعتين لازم يبقى فيهم عدد كفاية */
  comparable: boolean;
  /** الأوردر اللي فيه خصم أكبر بكام ٪ من اللي من غير */
  averageGapPercent: number;
  /** الأكواد — فاضية لو شوبيفاي ماجابتش أكواد لسه */
  codes: CodeRow[];
};

export type CodeRow = {
  code: string;
  orders: number;
  discount: number;
  revenue: number;
  returned: number;
};

function emptyGroup(): DiscountGroup {
  return {
    orders: 0,
    revenue: 0,
    average: 0,
    discount: 0,
    settled: 0,
    returned: 0,
    returnRate: null,
  };
}

export function discountImpact(orders: DiscountOrder[]): DiscountReport {
  const withD = { ...emptyGroup() };
  const withoutD = { ...emptyGroup() };
  const codes = new Map<string, CodeRow>();

  for (const o of orders) {
    if (CANCELLED.includes(String(o.orderStatus))) continue;

    const discount = Math.max(0, Number(o.discount) || 0);
    // ⚠️ اللي دفعه فعلًا — مش قيمة البضاعة
    const paid =
      (Number(o.itemsTotal) || 0) - discount + (Number(o.shipping) || 0);
    const settled = SETTLED.includes(String(o.orderStatus));
    const returned = RETURNED.includes(String(o.orderStatus));

    const g = discount > 0 ? withD : withoutD;
    g.orders += 1;
    g.revenue += paid;
    g.discount += discount;
    if (settled) g.settled += 1;
    if (returned) g.returned += 1;

    const code = String(o.code ?? "").trim().toUpperCase();
    if (discount > 0 && code) {
      const row = codes.get(code) ?? {
        code,
        orders: 0,
        discount: 0,
        revenue: 0,
        returned: 0,
      };
      row.orders += 1;
      row.discount += discount;
      row.revenue += paid;
      if (returned) row.returned += 1;
      codes.set(code, row);
    }
  }

  for (const g of [withD, withoutD]) {
    g.average = g.orders > 0 ? g.revenue / g.orders : 0;
    g.returnRate =
      g.settled > 0 ? Math.round((g.returned / g.settled) * 100) : null;
  }

  return {
    withDiscount: withD,
    without: withoutD,
    comparable:
      withD.orders >= MIN_ORDERS_PER_GROUP &&
      withoutD.orders >= MIN_ORDERS_PER_GROUP,
    averageGapPercent:
      withoutD.average > 0
        ? Math.round(((withD.average - withoutD.average) / withoutD.average) * 100)
        : 0,
    codes: [...codes.values()].sort((a, b) => b.discount - a.discount),
  };
}

/**
 * الحكم في سطر واحد.
 *
 * بيرجّع `null` لو المقارنة مالهاش معنى — **الصمت أحسن من حكم على ٣ أوردرات**.
 */
export function discountVerdict(r: DiscountReport): string | null {
  if (!r.comparable) return null;

  const gap = r.averageGapPercent;
  const bigger =
    gap > 0
      ? `الأوردر اللي فيه خصم أكبر بـ${gap}%`
      : `الأوردر اللي فيه خصم أصغر بـ${Math.abs(gap)}%`;

  const bits = [bigger];

  if (
    r.withDiscount.returnRate !== null &&
    r.without.returnRate !== null &&
    Math.abs(r.withDiscount.returnRate - r.without.returnRate) >= 5
  ) {
    bits.push(
      r.withDiscount.returnRate > r.without.returnRate
        ? `وبيرجع أكتر (${r.withDiscount.returnRate}% مقابل ${r.without.returnRate}%)`
        : `وبيرجع أقل (${r.withDiscount.returnRate}% مقابل ${r.without.returnRate}%)`
    );
  }

  return bits.join(" ");
}
