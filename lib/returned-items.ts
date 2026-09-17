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
