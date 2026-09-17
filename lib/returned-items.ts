/**
 * ==========================================================================
 * المرتجع بعد التسليم — على الأوردر نفسه (قرار عمر ١٧ سبتمبر)
 * --------------------------------------------------------------------------
 * لكل بند: الكمية الراجعة + حالتها (رجعت للمخزون / تالفة). والمبلغ اللي
 * اتحوّل للعميل على الأوردر، وبيطلع منه حركة خزنة.
 *
 * ⚠️ **الريفند مايتسجلش مصروف تاني** — كان بيتسجّل «مرتجعات» منفصل،
 * فمبيعات الأوردر كانت بتتشال **والريفند بيتطرح** (MONEY §٨.٦).
 *
 * ⚠️ **الحالة حقل فعلي مش شرط ثابت** — البضاعة ممكن ترجع تالفة. الافتراضي
 * «رجعت للمخزون». التالفة مابترجعش المخزون وتكلفتها بتفضل خسارة.
 *
 * محتاج `sql/returns-on-order.sql`.
 * ==========================================================================
 */

import { refundDue } from "./refund";

export type ReturnedCondition = "restocked" | "damaged";

export const RETURNED_CONDITIONS: { value: ReturnedCondition; label: string }[] = [
  { value: "restocked", label: "رجعت للمخزون" },
  { value: "damaged", label: "تالفة" },
];

export function parseCondition(raw: unknown): ReturnedCondition {
  return raw === "damaged" ? "damaged" : "restocked";
}

type ReturnState = { quantity: number; condition: ReturnedCondition };

const onShelf = (s: ReturnState) => (s.condition === "restocked" ? s.quantity : 0);

/**
 * كام قطعة تتضاف للمخزون (أو تتشال لو بالسالب) لما التسجيل يتغيّر.
 *
 * بيتحسب على **اللي رجع الرف** بس — التالف مالوش مكان في المخزون. فتغيير
 * بند من «رجعت» لـ«تالفة» بيشيل اللي كان اتضاف.
 */
export function shelfDelta(was: ReturnState, now: ReturnState): number {
  return onShelf(now) - onShelf(was);
}

/** الكمية الراجعة من المستخدم — عدد صحيح بين صفر وكمية البند */
export function clampReturned(raw: unknown, ordered: number): number {
  const text = raw == null ? "" : String(raw).trim();
  const n = text === "" ? 0 : Number(text);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, ordered);
}

// ==========================================================================
// فلوس الأوردر الراجع بعد التسليم — (ب) · قرار عمر ١٧ سبتمبر
// --------------------------------------------------------------------------
// ⚠️⚠️ **البيعة اتعملت وبعدين اترجعت.** فمبيعاته بتتحسب والريفند بيتطرح
// منها — مش بتتشال كلها. قبل كده كانت بتتشال **والريفند بيتطرح كمان**
// (مصروف «مرتجعات») فكان بيتخصم مرتين (MONEY §٨.٦).
//
// **والبضاعة اللي رجعت الرف تكلفتها مابتتحسبش** — لسه عندك وهتتباع تاني.
// التالفة تكلفتها بتفضل: دي خسارة فعلية.
//
// الأوردرات القديمة (قبل ١٧ سبتمبر) مالهاش كميات راجعة ولا ريفند على
// الأوردر، فتكلفتها كاملة وريفندها في مصروف «مرتجعات» — نفس النتيجة.
// ==========================================================================

export const RETURNED_AFTER_DELIVERY = "returned_after_delivery";

export type MoneyItem = {
  quantity: number;
  sale_price_at_order: number;
  cost_price_at_order?: number | null;
  returned_quantity?: number | null;
  returned_condition?: string | null;
};

type MoneyOrder = {
  order_status: string | null;
  refunded_amount?: number | null;
  /** لازم ييجي مع `refunded_amount` — من غيره الريفند بيتحسب لسه مستحق */
  refunded_at?: string | null;
  order_items: MoneyItem[];
};

const isReturnedAfter = (o: MoneyOrder) =>
  o.order_status === RETURNED_AFTER_DELIVERY;

/**
 * الريفند اللي بيتطرح من الأوردر — صفر لأي حالة تانية.
 *
 * ⚠️⚠️ **لسه ماتأكّدش؟ المستحق بيتطرح.** البضاعة رجعت الرف (تكلفتها
 * اتشالت) والفلوس لسه عندك بس مش بتاعتك. من غير كده الأوردر بيبان
 * بيعة كاملة من غير تكلفة لحد ما حد يدوس «أكّد».
 */
export function orderRefund(o: MoneyOrder): number {
  if (!isReturnedAfter(o)) return 0;
  if (o.refunded_at) return Number(o.refunded_amount ?? 0);
  return refundDue(
    o.order_items.map((i) => ({
      returnedQuantity: i.returned_quantity ?? 0,
      salePriceAtOrder: i.sale_price_at_order,
    }))
  );
}

/** القطع اللي رجعت الرف — التالف مش منهم */
function restockedQty(o: MoneyOrder, i: MoneyItem): number {
  if (!isReturnedAfter(o)) return 0;
  if (parseCondition(i.returned_condition) !== "restocked") return 0;
  return Math.min(Number(i.returned_quantity ?? 0), Number(i.quantity));
}

/** القطع اللي راجعة من العميل (سليمة أو تالفة) */
function returnedQty(o: MoneyOrder, i: MoneyItem): number {
  if (!isReturnedAfter(o)) return 0;
  return Math.min(Number(i.returned_quantity ?? 0), Number(i.quantity));
}

/** تكلفة البند اللي بتدخل الربح — من غير اللي رجع الرف */
export function itemCost(o: MoneyOrder, i: MoneyItem): number {
  return (
    (Number(i.quantity) - restockedQty(o, i)) * Number(i.cost_price_at_order ?? 0)
  );
}

/** البند بعد المرتجع — لترتيب المنتجات: الكمية والإيراد من غير الراجع */
export function itemKept(
  o: MoneyOrder,
  i: MoneyItem
): { qty: number; revenue: number; profit: number } {
  const qty = Number(i.quantity) - returnedQty(o, i);
  const revenue = qty * Number(i.sale_price_at_order);
  return { qty, revenue, profit: revenue - itemCost(o, i) };
}

/** اللي العميل دفعه فعلًا في الأوردر: البنود − الخصم + الشحن − الريفند */
export function orderNetTotal(
  o: MoneyOrder & {
    discount?: number | null;
    shipping_price?: number | null;
  }
): number {
  const goods = o.order_items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
    0
  );
  return (
    goods -
    Number(o.discount ?? 0) +
    Number(o.shipping_price ?? 0) -
    orderRefund(o)
  );
}
