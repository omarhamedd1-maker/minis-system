// ==========================================================================
// المخزون هيقعد كام يوم كمان
// --------------------------------------------------------------------------
// «فاضل ٩ قطع» مش معلومة لوحدها. ٩ قطع من حاجة بتتباع ٣ في اليوم = **٣
// أيام**، و٩ من حاجة بتتباع واحدة في الشهر = تسع شهور. الرقم المفيد هو
// **الأيام** مش الكمية.
//
// ⚠️⚠️ **المعدّل بيتحسب على نافذة ثابتة مش على عمر المنتج.** لو قسمنا على
// كل تاريخ المنتج، حاجة باعت ١٠٠ قطعة في أول شهر وبقت ميتة من ٦ شهور هتطلع
// «بتتباع كل يوم» وهي واقفة. النافذة بتقول **بيتباع كام دلوقتي**.
//
// ⚠️ **والمنتج اللي مااتباعش خالص في النافذة مالوش تنبيه** — مش هينفد،
// وتحذير عليه بيغرق التنبيه الحقيقي.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

/** الحالات اللي البضاعة فيها خرجت فعلًا (الملغي والراجع مش استهلاك) */
const SOLD = ["confirmed", "packed", "ready", "shipped", "out_for_delivery", "delivered"];

/** النافذة اللي بنقيس عليها معدّل البيع */
export const WINDOW_DAYS = 30;

/**
 * ⚠️ **أقل من كده مايتحسبش معدّل.**
 *
 * قطعتين في ٣٠ يوم بيدّوا «كل ١٥ يوم قطعة»، وأي تقدير مبني عليهم بيتحرّك
 * شهور بقطعة واحدة زيادة أو نقصان.
 */
export const MIN_UNITS_IN_WINDOW = 3;

/** الحد اللي تحته بنقول «قرّب يخلص» */
export const LOW_DAYS = 14;

export type RunwayVariant = {
  id: string;
  name: string;
  /** الموجود دلوقتي */
  onHand: number;
};

export type RunwaySale = {
  variantId: string | null;
  /** تاريخ الأوردر */
  at: string | null;
  orderStatus: string | null;
  quantity: number;
};

export type RunwayRow = {
  id: string;
  name: string;
  onHand: number;
  /** اتباع كام في النافذة */
  soldInWindow: number;
  /** قطع في اليوم */
  perDay: number;
  /** فاضل كام يوم — و`null` لو الرقم مش متمسك */
  daysLeft: number | null;
  /**
   * رقم المخزون ده يتصدّق؟
   *
   * ⚠️⚠️ **البضاعة اللي بتتباع ومخزونها صفر أو بالسالب = الرقم مش متمسك**،
   * مش «خلصت». محدش بيبيع ٧٣ قطعة من مخزون صفر.
   *
   * اتكشف على داتا حقيقية (١٩ أغسطس ٢٠٢٦): **٨٩ شكل من ١٠١ في مينيز**
   * مخزونهم صفر و٥ بالسالب. من غير التفرقة دي التنبيه كان هيرن كل يوم
   * على أكتر منتجين بيبيعوا عندك ويقول إنهم خلصوا وهما شغالين.
   */
  tracked: boolean;
};

/**
 * المنتجات اللي قرّبت تخلص، الأقرب الأول.
 *
 * `now` بيتبعت جوّه عشان الاختبار يبقى ثابت.
 */
export function stockRunway(
  variants: RunwayVariant[],
  sales: RunwaySale[],
  now: Date,
  windowDays: number = WINDOW_DAYS
): RunwayRow[] {
  const cutoff = now.getTime() - windowDays * 86_400_000;

  const sold = new Map<string, number>();
  for (const s of sales) {
    const id = String(s.variantId ?? "").trim();
    if (!id) continue;
    if (!SOLD.includes(String(s.orderStatus))) continue;
    if (!s.at) continue;
    const t = new Date(s.at).getTime();
    if (Number.isNaN(t) || t < cutoff) continue;
    const q = Number(s.quantity) || 0;
    if (q <= 0) continue;
    sold.set(id, (sold.get(id) ?? 0) + q);
  }

  const rows: RunwayRow[] = [];

  for (const v of variants) {
    const soldInWindow = sold.get(v.id) ?? 0;
    if (soldInWindow < MIN_UNITS_IN_WINDOW) continue;

    const perDay = soldInWindow / windowDays;
    const onHand = Number(v.onHand) || 0;
    const tracked = onHand > 0;

    rows.push({
      id: v.id,
      name: v.name,
      onHand,
      soldInWindow,
      perDay,
      daysLeft: tracked ? Math.floor(onHand / perDay) : null,
      tracked,
    });
  }

  return rows.sort(
    (a, b) => (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER)
  );
}

/** اللي فاضلهم أقل من الحد — واللي رقمه مش متمسك مش فيهم */
export function runningOut(
  rows: RunwayRow[],
  lowDays: number = LOW_DAYS
): RunwayRow[] {
  return rows.filter((r) => r.tracked && r.daysLeft !== null && r.daysLeft <= lowDays);
}

/**
 * اللي بيتباع ومخزونه مكتوب صفر — **دي مش «خلصت»، دي «الرقم مش متسجّل»**.
 *
 * بتتعرض كخبر هادي مش كتنبيه: التنبيه بيطلب تصرّف، وده بيقول إن خانة
 * المخزون مالهاش معنى دلوقتي.
 */
export function untrackedSellers(rows: RunwayRow[]): RunwayRow[] {
  return rows.filter((r) => !r.tracked);
}
