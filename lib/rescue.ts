// ==========================================================================
// شحنات لسه ينفع تتنقذ
// --------------------------------------------------------------------------
// بوسطة بتحاول تلات مرات وبتبعت رسالة، وبعدين بترجّع الشحنة. واللي بيفرق
// في النص ده إن **حد يتصل**.
//
// وده مش كلام: عند مينيز (١٩ أغسطس ٢٠٢٦) أكبر سببين للرجوع هما **٢١ «رفض
// يستلم»** و**١٦ «طلب التأجيل»** — الاتنين مكالمة كانت ممكن تقلبهم.
//
// ⚠️⚠️ **الوقت هنا ضيق.** بوسطة بتحاول تاني بعد يوم أو يومين، فالمكالمة
// لازم تحصل قبلها. عشان كده الترتيب بالأحدث — مش بالأقدم زي باقي القوايم.
//
// ⚠️ **واللي رجع خلاص مش هنا** — الشحنة اللي بقت «راجعة» فات وقتها، والسطر
// اللي مالوش فعل بيبقى لوم.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

/** الحالات اللي لسه الشحنة فيها برّه ومعاها فرصة */
const STILL_OUT = ["shipped", "out_for_delivery", "awaiting_action"];

/**
 * ⚠️ **المحاولة الأقدم من كده فات وقتها.**
 *
 * بوسطة بترجّع الشحنة بعد ٣ محاولات على مدى أيام. المحاولة اللي عدّى عليها
 * أسبوع يبقى القرار اتاخد خلاص، والسطر بيتحوّل لضوضاء.
 */
export const RESCUE_WINDOW_DAYS = 7;

export type RescueOrder = {
  id: string;
  orderNumber: string | null;
  orderStatus: string | null;
  /** سبب آخر محاولة زي ما بوسطة قالته */
  exception?: string | null;
  /** إمتى اتسجّلت آخر حركة على الشحنة */
  lastMoveAt?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** المطلوب عند الاستلام */
  cod?: number | null;
};

export type RescueRow = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string;
  /** السبب زي ما وصلنا */
  reason: string;
  /** بقاله كام يوم */
  days: number;
  cod: number;
  /** بوسطة رفعت إيدها ومستنياك؟ */
  waiting: boolean;
};

function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  const d = Math.floor((now.getTime() - t) / 86_400_000);
  return d < 0 ? null : d;
}

/**
 * مين يتكلّم دلوقتي.
 *
 * بيرجّع **الأحدث الأول** — العكس المقصود: دي الشحنة اللي لسه فيها وقت.
 */
export function rescueQueue(orders: RescueOrder[], now: Date): RescueRow[] {
  const out: RescueRow[] = [];

  for (const o of orders) {
    if (!STILL_OUT.includes(String(o.orderStatus))) continue;

    const reason = String(o.exception ?? "").trim();
    const waiting = o.orderStatus === "awaiting_action";
    // مافيش محاولة فاشلة ولا بوسطة واقفة؟ يبقى ماشية عادي
    if (!reason && !waiting) continue;

    const phone = String(o.customerPhone ?? "").trim();
    if (!phone) continue;

    const days = daysSince(o.lastMoveAt, now);
    if (days !== null && days > RESCUE_WINDOW_DAYS) continue;

    out.push({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName ?? null,
      customerPhone: phone,
      reason: reason || "بوسطة واقفة ومستنية قرار",
      days: days ?? 0,
      cod: Number(o.cod ?? 0) || 0,
      waiting,
    });
  }

  // الأحدث الأول، واللي بوسطة مستنياه فوق الكل
  return out.sort((a, b) => {
    if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
    return a.days - b.days;
  });
}

/** إجمالي الفلوس اللي في الطابور — ده اللي بيخلّي المكالمة تستاهل */
export function rescueValue(rows: RescueRow[]): number {
  return rows.reduce((s, r) => s + r.cod, 0);
}
