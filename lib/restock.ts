// ==========================================================================
// المرتجع يرجع المخزن
// --------------------------------------------------------------------------
// الشحنة بترجع في الواقع والبضاعة بتترجّع على الرف — **والمخزون في السيستم
// مابيتحركش**. ده جزء من سبب إن ٨٩ شكل من ١٠١ مخزونهم مكتوب صفر.
//
// ⚠️⚠️ **مرة واحدة بس.** الرجوع للمخزن لازم يتعلّم، وإلا دوستين على الزرار
// بيزوّدوا الكمية مرتين — وده أوحش من إنها ماترجعش أصلًا: الرقم الغلط
// بيخلّيك تبيع حاجة مش موجودة.
//
// ⚠️ **والأوردر اللي مخزونه ماتخصمش أصلًا مايترجعش** — الأوردرات القديمة
// اللي اتسجّلت قبل السيستم دخلت من غير حركة مخزون، فرجوعها بيزوّد الرقم من
// غير ما ينقص قبلها.
//
// **الملف ده صافي** — بياخد حالة وبنود وبيقول يترجّع إيه.
// ==========================================================================

/** الحالات اللي معناها البضاعة رجعت لك فعلًا */
const CAME_BACK = ["returned", "returned_after_delivery"];

export type RestockItem = {
  variantId: string | null;
  quantity: number;
};

export type RestockOrder = {
  orderStatus: string | null;
  /**
   * اترجّع قبل كده؟
   *
   * ⚠️ **العلامة من حركات المخزون نفسها مش من عمود جديد** — الحركة
   * بتتسجّل بسبب اسمه، فوجودها هي الدليل. كده مافيش عمود لازم يتضاف
   * ومافيش حالة الكود فيها بيقول «رجعت» والحركة مش موجودة.
   */
  alreadyRestocked: boolean;
  /** الأوردر ده خصم مخزون وقت ما اتعمل؟ */
  hadStockMovement: boolean;
  items: RestockItem[];
};

export type RestockPlan =
  | { ok: true; items: { variantId: string; quantity: number }[] }
  | { ok: false; reason: string };

/**
 * يترجّع إيه للمخزن.
 *
 * ⚠️ **بيرجّع السبب بالعربي لما ماينفعش** — الزرار اللي بيختفي من غير سبب
 * بيخلّي اللي بيستخدمه يفتكر إن السيستم باظ.
 */
export function planRestock(order: RestockOrder): RestockPlan {
  if (!CAME_BACK.includes(String(order.orderStatus))) {
    return { ok: false, reason: "الأوردر ده مارجعش" };
  }

  if (order.alreadyRestocked) {
    return { ok: false, reason: "رجع المخزن خلاص" };
  }

  if (!order.hadStockMovement) {
    return {
      ok: false,
      reason: "الأوردر ده مخصمش من المخزون أصلًا، فمفيش حاجة ترجع",
    };
  }

  const items = (order.items ?? [])
    .map((i) => ({
      variantId: String(i.variantId ?? "").trim(),
      quantity: Number(i.quantity) || 0,
    }))
    .filter((i) => i.variantId && i.quantity > 0);

  if (items.length === 0) {
    return { ok: false, reason: "مفيش بنود ترجع" };
  }

  return { ok: true, items };
}

/** جملة الخلاصة بعد ما يرجع */
export function restockSummary(items: { quantity: number }[]): string {
  const pieces = items.reduce((s, i) => s + i.quantity, 0);
  return `رجع ${pieces} قطعة للمخزن`;
}
