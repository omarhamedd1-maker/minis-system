// ==========================================================================
// بوابة التليفون — آخر أرقام من تليفون الأوردر
// --------------------------------------------------------------------------
// صفحة التتبع مفتوحة للكل وبتوري الحالة وبس. التفاصيل (المنتجات والعنوان
// والمبلغ) بتتفتح لما العميل يكتب **آخر أرقام من تليفونه**.
//
// ⚠️ **العميل بيكتب الرقم كامل، والصفحة بتوريه آخر رقمين كتلميح** — عشان
// يعرف أنهي رقم هو ده من غير ما الرقم كله يبان لأي حد فاتح اللينك.
//
// وفوقها **عدّ المحاولات**: بعد عدد محاولات غلط على نفس الشحنة، البوابة
// بتتقفل لفترة.
//
// ⚠️ **والمقارنة على الأرقام بس** — العميل بيكتب «67» أو «٦٧» أو «0100…67»
// وكلهم لازم يعدّوا.
//
// **الملف ده صافي** — والعدّاد بيتبعت جوّه عشان يتختبر.
// ==========================================================================

/**
 * أقل عدد أرقام مقبول.
 *
 * ⚠️ **كان رقمين، ورجع ٨ بقرار عمر** — رقمين معناهم ١٠٠ احتمال بس،
 * والرقم كامل بيخلّي البوابة ليها معنى حقيقي.
 */
export const MIN_TYPED = 8;

/** المحاولات الغلط المسموحة على نفس الشحنة */
export const MAX_TRIES = 5;

/** القفلة بعد ما المحاولات تخلص */
export const LOCK_MINUTES = 15;

/** أرقام عربي ← إنجليزي، والباقي بيتشال */
export function digits(value: string | null | undefined): string {
  let out = "";
  for (const ch of String(value ?? "")) {
    const ar = "٠١٢٣٤٥٦٧٨٩".indexOf(ch);
    if (ar >= 0) out += String(ar);
    else if (ch >= "0" && ch <= "9") out += ch;
  }
  return out;
}

/**
 * اللي العميل كتبه بيطابق آخر تليفون الأوردر؟
 *
 * بيقارن **بآخر ما كتبه** — لو كتب رقمين بنقارن آخر رقمين، ولو كتب الرقم
 * كامل بنقارن آخر ٩ (الجزء اللي مابيتغيّرش بين `+20…` و`0…`).
 */
export function tailMatches(
  stored: string | null | undefined,
  typed: string | null | undefined
): boolean {
  const a = digits(stored);
  const b = digits(typed);
  if (b.length < MIN_TYPED || a.length < MIN_TYPED) return false;

  const n = Math.min(b.length, 9);
  return a.slice(-n) === b.slice(-n);
}

export type Attempts = { wrong: number; until: number };

/**
 * حالة البوابة لشحنة.
 *
 * `null` معناها مفيش محاولات غلط متسجّلة.
 */
export function isLocked(state: Attempts | null | undefined, now: number): boolean {
  if (!state) return false;
  return state.wrong >= MAX_TRIES && now < state.until;
}

/** بعد محاولة غلط */
export function afterWrong(
  state: Attempts | null | undefined,
  now: number
): Attempts {
  // القفلة خلصت؟ نبدأ من الأول
  const fresh = !state || (state.wrong >= MAX_TRIES && now >= state.until);
  const wrong = fresh ? 1 : state!.wrong + 1;

  return {
    wrong,
    until: wrong >= MAX_TRIES ? now + LOCK_MINUTES * 60_000 : 0,
  };
}


/**
 * آخر رقمين بشكل مقنّع — تلميح للعميل مش كشف للرقم.
 *
 * ⚠️ **رقمين بس هما اللي بيبانوا** — ده كفاية إن صاحب الأوردر يعرف رقمه،
 * ومش كفاية إن حد تاني يستنتج الرقم.
 */
export function maskedTail(phone: string | null | undefined): string | null {
  const d = digits(phone);
  if (d.length < MIN_TYPED) return null;
  return "•".repeat(Math.min(d.length - 2, 9)) + d.slice(-2);
}
