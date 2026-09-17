/**
 * ==========================================================================
 * الرصيد الافتتاحي (MONEY §٦.٤ · الخطوة ١٥)
 * --------------------------------------------------------------------------
 * الخزنة بدأت بفلوس قبل أول حركة متسجّلة. قبل كده الطريقة الوحيدة كانت
 * حركة «إيداع» يدوية مكتوب عليها «رصيد افتتاحي» — بتبان حركة زيها زي
 * التحصيل، وممكن تتعدّل أو تتلغي من غير ما حد ياخد باله إن ده أساس الرصيد.
 *
 * ⚠️ **الرصيد والمجاميع بيحسبوه زي ما هو** — «إجمالي الداخل» فيه، عشان
 * الداخل − الخارج يفضل = الرصيد.
 *
 * دلوقتي هو صف لوحده (`source_type = 'opening'`)، **واحد بس لكل بيزنس**
 * (`sql/cash-opening.sql`)، و**تاريخه قبل أول حركة** — من غير كده الرصيد
 * الجاري بيتحسب بترتيب غلط.
 *
 * ⚠️ **بيتعدّل في مكانه، مش بحركة عكسية.** هو مش حركة حصلت — هو نقطة
 * البداية. التعديل بيتسجّل في سجل النشاط بالقيمة القديمة والجديدة.
 * ==========================================================================
 */

import { shiftDays } from "./periods";

export const OPENING = "opening";
export const OPENING_LABEL = "رصيد افتتاحي";

const day = (d: string | null | undefined) => String(d ?? "").slice(0, 10);

/**
 * آخر تاريخ ينفع للرصيد الافتتاحي: اليوم اللي قبل أول حركة.
 * `null` = مفيش حركات، فأي تاريخ ينفع.
 */
export function latestOpeningDate(firstMoveDate: string | null | undefined): string | null {
  const d = day(firstMoveDate);
  return d ? shiftDays(d, -1) : null;
}

export type OpeningCheck =
  | { ok: true; amount: number; date: string }
  | { ok: false; error: string };

export function checkOpening(input: {
  amount: unknown;
  date: unknown;
  firstMoveDate: string | null | undefined;
}): OpeningCheck {
  const text = String(input.amount ?? "").trim();
  const amount = text === "" ? NaN : Number(text);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "اكتب مبلغ صفر أو أكتر" };
  }
  const date = day(String(input.date ?? ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "اختار التاريخ" };
  }
  const latest = latestOpeningDate(input.firstMoveDate);
  if (latest && date > latest) {
    return {
      ok: false,
      error: `الرصيد الافتتاحي لازم يكون قبل أول حركة (${day(input.firstMoveDate)})`,
    };
  }
  return { ok: true, amount: Math.round(amount * 100) / 100, date };
}
