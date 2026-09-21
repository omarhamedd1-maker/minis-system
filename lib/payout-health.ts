/**
 * ==========================================================================
 * التحويل «المتأكّد» اللي تحته مافيش حاجة (TRANSFERS §٨.١ · ٢١ سبتمبر)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **الحالة دي أوحش من الغلط الواضح.** تحويل مكتوب عليه «متأكّد»
 * ومربوط بحركة خزنة **اتلغت** بيقرا صح تمامًا — واللي بيبص مابيراجعوش
 * أصلًا، لأن الشاشة بتقول إنه تمام.
 *
 * حصلت فعلًا على مينيز (تحويل ٥,٦٩١ · `MANUAL20260921`): الحركة اتلغت
 * بحركة عكسية، والتحويل فضل «متأكّد» شهر وهو مبني على حاجة اتشالت.
 *
 * **القاعدة:** التحويل «متأكّد» أو «متطابق» لازم تحته حركة **حيّة**.
 * غير كده يرجع «محتاج مراجعة» **وسببه مكتوب** — مش يختفي ومش يفضل ساكت.
 *
 * ⚠️ **الفلوس مابتتلمسش هنا خالص** — ده بيصحّح **وصف** التحويل بس.
 * الحركة العكسية اللي اتعملت هي اللي ظبّطت الرصيد، والفحص ده بيخلّي
 * الشاشة تقول الحقيقة بعدها.
 *
 * **الملف ده صافي.**
 * ==========================================================================
 */

/** الحالات اللي معناها «تمام، مافيش شغل هنا» */
const SETTLED = ["confirmed", "matched"];

export type PayoutCashState = {
  id: string;
  status: string | null;
  cashTransactionId: string | null;
};

export type StalePayout = { id: string; reason: string };

export const CANCELLED_REASON = "الحركة المربوطة اتلغت — راجع التحويل";
export const MISSING_REASON = "الحركة المربوطة مش موجودة — راجع التحويل";

/**
 * التحويلات اللي لازم ترجع «محتاج مراجعة».
 *
 * `reversed` = حركات اتلغت بحركة عكسية · `missing` = حركات مش موجودة أصلًا
 * (الربط `on delete set null`، فالمفروض مايحصلش — بس لو حصل بيتقال).
 */
export function stalePayouts(
  payouts: PayoutCashState[],
  reversed: Set<string>,
  missing: Set<string> = new Set()
): StalePayout[] {
  const out: StalePayout[] = [];
  for (const p of payouts) {
    // ⚠️ اللي «محتاج مراجعة» أصلًا مالوش لازمة — هو ظاهر في الشاشة خلاص
    if (!SETTLED.includes(String(p.status))) continue;
    if (!p.cashTransactionId) continue;
    if (missing.has(p.cashTransactionId)) {
      out.push({ id: p.id, reason: MISSING_REASON });
    } else if (reversed.has(p.cashTransactionId)) {
      out.push({ id: p.id, reason: CANCELLED_REASON });
    }
  }
  return out;
}
