// ==========================================================================
// الأرباح اللي مبنية على تكلفة صفر — القرار
// --------------------------------------------------------------------------
// **الربح عندنا = سعر البيع − تكلفة المنتج.** لو التكلفة صفر، الربح بيطلع
// **مساوي للإيراد بالظبط** — والشاشة بتعرضه كأنه ربح حقيقي.
//
// ⚠️⚠️ **ودي مش حالة نادرة عند البيزنس الجديد.** شوبيفاي **مافيهاش تكلفة**،
// فأي بيزنس يربط متجره بيدخل بكل تكاليفه صفر لحد ما ملف التكاليف يتملا.
//
// الأرقام الحقيقية (١٨ أغسطس ٢٠٢٦):
//
//   | البيزنس | متسلّم | كله بتكلفة صفر |
//   |---|---|---|
//   | مينيز | ٢٤٣ | ٣ (١٪) |
//   | ٢ سِك | ١٣١ | **١٣١ (١٠٠٪)** — ربح ٨٥٬٨٠٩ ج وهو الإيراد نفسه |
//
// **الرقم مش غلط في الحساب — غلط في المعنى.** والحل مش إننا نغيّر الرقم
// (إحنا مانعرفش التكلفة)، الحل إن الشاشة تقول إن الرقم ده مش ربح.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

export type CostItem = { cost_price_at_order: number };
export type CostOrder = { order_items?: CostItem[] | null };

export type ZeroCostNote = {
  /** أوردرات كل بنودها بتكلفة صفر */
  allZero: number;
  /** أوردرات فيها بند بتكلفة صفر وبند لأ */
  someZero: number;
  /** المقام — الأوردرات اللي ليها بنود أصلًا */
  counted: number;
  /** نسبة اللي كله بصفر */
  share: number;
  /**
   * **الأرباح مبنية على تكلفة ناقصة لدرجة إن عرضها يضلّل.**
   *
   * العتبة **٢٠٪** مش عشوائية: تحت كده الرقم لسه بيعبّر عن الاتجاه،
   * وفوق كده الربح بيقرب من الإيراد فيبقى رقم تاني خالص بنفس الاسم.
   */
  misleading: boolean;
};

const THRESHOLD = 0.2;

export function zeroCostNote(orders: CostOrder[]): ZeroCostNote {
  let allZero = 0;
  let someZero = 0;
  let counted = 0;

  for (const o of orders) {
    const items = o.order_items ?? [];
    if (items.length === 0) continue;
    counted++;
    const zeros = items.filter((i) => Number(i.cost_price_at_order) === 0).length;
    if (zeros === items.length) allZero++;
    else if (zeros > 0) someZero++;
  }

  const share = counted === 0 ? 0 : allZero / counted;
  return {
    allZero,
    someZero,
    counted,
    share: Math.round(share * 100),
    misleading: counted > 0 && share >= THRESHOLD,
  };
}

/** الجملة اللي بتتعرض — `null` يعني مافيش حاجة تتقال */
export function zeroCostMessage(n: ZeroCostNote): string | null {
  if (!n.misleading) return null;
  if (n.share === 100) {
    return "⚠️ كل المنتجات تكلفتها صفر، فالرقم اللي مكتوب «ربح» هو المبيعات نفسها. بيبقى ربح حقيقي أول ما التكاليف تتسجّل.";
  }
  return `⚠️ ${n.share}% من الأوردرات تكلفتها صفر، فالربح بيبان أعلى من الحقيقة بقيمة البضاعة نفسها.`;
}
