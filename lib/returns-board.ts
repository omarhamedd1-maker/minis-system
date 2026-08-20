// ==========================================================================
// موديول المرتجعات — كل حاجة راجعة في مكان واحد
// --------------------------------------------------------------------------
// المرتجع دلوقتي متفرّق: السبب في صفحة الأوردر، والقيمة في التقرير، ورجوع
// البضاعة للمخزن في زرار جوّه الأوردر. **مفيش مكان بيقولك المرتجعات
// عاملة إيه**، ومحدش بيلاحظ الرقم بيكبر غير لما المخزون يبوظ.
//
// ⚠️⚠️ **الراجع اللي مارجعش المخزن هو أخطر رقم هنا.** البضاعة موجودة في
// إيدك في الواقع، والسيستم فاكرها متباعة — يعني بتشتري تاني حاجة عندك،
// والمخزون بيقول صفر وهو مش صفر.
//
// ⚠️ **و«راجع» مش نوع واحد**: فيه اللي رجع قبل ما يستلم (`returned`)، وفيه
// اللي استلم وبعدين رجّع (`returned_after_delivery`). التاني بيكلّف شحنتين
// وبيبقى فلوس اترجعت فعلًا — فالخلط بينهم بيصغّر الوجع.
//
// **الملف ده صافي** — بياخد أوردرات وبيرجّع لوحة.
// ==========================================================================

/** رجع قبل التسليم */
export const BEFORE = "returned";
/** استلم وبعدين رجّع — ده اللي بيوجع */
export const AFTER = "returned_after_delivery";

export type ReturnOrder = {
  id: string;
  orderNumber: string | null;
  orderStatus: string | null;
  /** تاريخ آخر حركة — بيتستخدم للفترة */
  movedAt: string | null;
  reason: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** إجمالي البنود */
  itemsTotal: number;
  /** اللي بوسطة خدته فعلاً في الرايح والجاي */
  shippingCost: number;
  /** البضاعة رجعت المخزن؟ */
  restocked: boolean;
  /**
   * الأوردر ده خصم مخزون وقت ما اتعمل؟
   *
   * ⚠️⚠️ **من غير الشرط ده الشاشة بتكدب.** الأوردرات القديمة اتسجّلت من
   * غير حركة مخزون، فرجوعها مش «بضاعة ضايعة» — هي أصلًا ماكانتش متخصومة.
   * على داتا مينيز الفرق ده كان **١٨ أوردر بـ٣٥٬٧٤١ جنيه** مقابل الحقيقة
   * **٩ بـ١٦٬٣٨٩**: نُص الإنذار كان وهم.
   */
  hadStockMovement: boolean;
};

export type ReturnRow = ReturnOrder & {
  /** استلم وبعدين رجّع؟ */
  afterDelivery: boolean;
  /** اللي ضاع فعلاً: الشحن اللي اتدفع (والبضاعة لو مارجعتش) */
  lost: number;
};

export type ReturnsBoard = {
  rows: ReturnRow[];
  /** عدد كل الراجع في الفترة */
  count: number;
  /** منهم كام استلم وبعدين رجّع */
  afterDelivery: number;
  /** ⚠️ الراجع اللي خصم مخزون ولسه مارجعوش */
  notRestocked: ReturnRow[];
  /**
   * الراجع اللي مالوش حركة مخزون خالص.
   *
   * ⚠️ **دول مش مشكلة ومش تمام** — حالة تالتة: مينفعش يرجعوا المخزن لأن
   * مافيش حاجة اتخصمت. بنعدّهم عشان الفرق بين الرقمين مايبانش كإخفاء.
   */
  outsideStock: ReturnRow[];
  /** قيمة البضاعة اللي في إيدك والسيستم مش عارفها */
  stuckValue: number;
  /** الشحن اللي اتدفع في اللفتين على كل الراجع */
  shippingBurned: number;
  /** الأسباب مرتّبة بالأكتر */
  byReason: { reason: string; count: number; value: number }[];
};

/**
 * بيبني لوحة المرتجعات.
 *
 * ⚠️ **الترتيب بالأحدث** — المرتجع القديم اتقفل خلاص، واللي النهاردة هو
 * اللي لسه ينفع تعمل فيه حاجة.
 */
export function returnsBoard(orders: ReturnOrder[]): ReturnsBoard {
  const rows: ReturnRow[] = [];

  for (const o of orders) {
    const status = String(o.orderStatus ?? "");
    if (status !== BEFORE && status !== AFTER) continue;

    const afterDelivery = status === AFTER;
    const shipping = Math.max(0, Number(o.shippingCost) || 0);
    const goods = Math.max(0, Number(o.itemsTotal) || 0);

    rows.push({
      ...o,
      afterDelivery,
      // ⚠️ **البضاعة اللي رجعت المخزن مش خسارة** — الخسارة الشحن بس.
      // اللي مارجعش المخزن، بضاعته ضايعة من الحسابات وإن كانت في إيدك.
      lost: shipping + (o.restocked || !o.hadStockMovement ? 0 : goods),
    });
  }

  rows.sort((a, b) => String(b.movedAt ?? "").localeCompare(String(a.movedAt ?? "")));

  // ⚠️ **التلاتة مختلفين**: رجع المخزن · خصم ومارجعش · ماخصمش أصلًا
  const notRestocked = rows.filter((r) => !r.restocked && r.hadStockMovement);
  const outsideStock = rows.filter((r) => !r.restocked && !r.hadStockMovement);

  const reasons = new Map<string, { count: number; value: number }>();
  for (const r of rows) {
    // الفاضي سبب برضه — «مش مكتوب» هو أشهر سبب فعلاً
    const key = String(r.reason ?? "").trim() || "unknown";
    const cur = reasons.get(key) ?? { count: 0, value: 0 };
    reasons.set(key, { count: cur.count + 1, value: cur.value + r.itemsTotal });
  }

  return {
    rows,
    count: rows.length,
    afterDelivery: rows.filter((r) => r.afterDelivery).length,
    notRestocked,
    outsideStock,
    stuckValue: notRestocked.reduce((s, r) => s + r.itemsTotal, 0),
    shippingBurned: rows.reduce((s, r) => s + Math.max(0, r.shippingCost), 0),
    byReason: [...reasons.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * نسبة الرجوع من اللي خلص.
 *
 * ⚠️ **المقام هو اللي خلص، مش كل الأوردرات.** الأوردر اللي لسه في السكة
 * لسه ممكن يرجع، وحطّه في المقام بيخلّي النسبة أصغر من الحقيقة كل يوم.
 */
export function returnRate(settled: number, returned: number): number | null {
  if (settled <= 0) return null;
  return Math.round((returned / settled) * 1000) / 10;
}
