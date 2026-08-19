// ==========================================================================
// حسّاس العطل — المبيعات وقعت فجأة
// --------------------------------------------------------------------------
// كل التقارير بتقول لك اللي حصل بعد ما يحصل. ده بيقول لك **دلوقتي**: النهاردة
// المبيعات أقل بكتير من المعتاد.
//
// وغالبًا السبب مش «السوق» — الموقع واقع، أو الإعلان وقف، أو طريقة الدفع
// بايظة، أو الاستيراد من شوبيفاي واقف. والتقرير الأسبوعي بيقول لك بعد ٥ أيام.
//
// ⚠️⚠️ **المقارنة بنفس اليوم من الأسبوع مش بالمتوسط العام.** السبت عندك ٥٥
// شحنة والجمعة ١٨ — يعني «أقل من المتوسط» يوم الجمعة حاجة طبيعية كل أسبوع،
// والتنبيه اللي بيرن كل جمعة بيتقفل بعد شهر.
//
// ⚠️ **ولازم يكون فيه تاريخ كفاية.** يومين مقارنة مش أساس، والتنبيه المبني
// على أسبوعين بيرن على أي حاجة.
//
// **الملف ده صافي** — بياخد أوردرات وبيرجّع تنبيه أو لا.
// ==========================================================================

/** الحالات اللي مش بيعة */
const NOT_A_SALE = ["cancelled"];

/** ⚠️ أقل من كده مافيش مقارنة — أسبوعين مش تاريخ */
export const MIN_WEEKS = 3;

/** النزول اللي بعده بننبّه */
export const DROP_THRESHOLD = 0.6;

/** ⚠️ اليوم اللي متوسطه أقل من كده مايتقارنش — يوم بأوردر واحد بيتقلب بسهولة */
export const MIN_AVERAGE = 2;

export type DropOrder = {
  orderStatus: string | null;
  orderDate: string | null;
};

export type DropCheck = {
  /** أوردرات النهاردة */
  today: number;
  /** متوسط نفس اليوم من الأسابيع اللي فاتت */
  usual: number;
  /** كام أسبوع دخل في المتوسط */
  weeks: number;
  /** النزول ٪ — و`null` لو مفيش مقارنة */
  dropPercent: number | null;
  /** ننبّه؟ */
  alert: boolean;
};

function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** يوم الأسبوع من تاريخ نصي */
function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/**
 * المبيعات النهاردة مقابل نفس اليوم من الأسابيع اللي فاتت.
 *
 * `now` بيتبعت جوّه عشان الاختبار يبقى ثابت.
 */
export function checkDrop(
  orders: DropOrder[],
  now: Date,
  weeksBack = 4
): DropCheck {
  const today = now.toISOString().slice(0, 10);
  const todayWeekday = weekdayOf(today);

  const perDay = new Map<string, number>();
  for (const o of orders) {
    if (NOT_A_SALE.includes(String(o.orderStatus))) continue;
    const day = dayOf(o.orderDate);
    if (!day) continue;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  // نفس يوم الأسبوع في الأسابيع اللي فاتت — من غير النهاردة
  const past: number[] = [];
  for (let w = 1; w <= weeksBack; w++) {
    const d = new Date(now.getTime() - w * 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (weekdayOf(d) !== todayWeekday) continue;
    past.push(perDay.get(d) ?? 0);
  }

  const todayCount = perDay.get(today) ?? 0;
  const usual =
    past.length > 0 ? past.reduce((s, n) => s + n, 0) / past.length : 0;

  const enough = past.length >= MIN_WEEKS && usual >= MIN_AVERAGE;
  const dropPercent = enough ? Math.round((1 - todayCount / usual) * 100) : null;

  return {
    today: todayCount,
    usual: Math.round(usual * 10) / 10,
    weeks: past.length,
    dropPercent,
    alert: enough && todayCount < usual * (1 - DROP_THRESHOLD),
  };
}

/**
 * نص التنبيه.
 *
 * ⚠️ **بيقول الرقم والسبب المحتمل، من غير ما يقول لك اعمل إيه** — قرار عمر
 * في كل التنبيهات.
 */
export function dropMessage(check: DropCheck, day: string): string {
  return [
    "المبيعات واقعة النهاردة",
    `${check.today} أوردر، والمعتاد يوم ${day} حوالي ${check.usual}`,
    "ده بيحصل عادة لما الموقع يقع، أو الإعلان يقف، أو المزامنة تتعطّل",
  ].join("\n");
}
