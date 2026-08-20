// ==========================================================================
// حسّاس العطل — المبيعات وقعت فجأة
// --------------------------------------------------------------------------
// كل التقارير بتقول لك اللي حصل بعد ما يحصل. ده بيقول لك **دلوقتي**: النهاردة
// المبيعات أقل بكتير من المعتاد.
//
// وغالبًا السبب مش «السوق» — الموقع واقع، أو الإعلان وقف، أو طريقة الدفع
// بايظة، أو الاستيراد من شوبيفاي واقف. والتقرير الأسبوعي بيقول لك بعد ٥ أيام.
//
// ⚠️⚠️ **اليوم اللي لسه بادئ مش يوم واقع.** أول نسخة كانت بتقارن اليوم كله
// باللي فات، فالساعة ٣ الفجر كانت بترن كل يوم بـ«٠ أوردر النهاردة» —
// واليوم أصلًا ماكانش بدأ. التنبيه ده وصل لعمر ٢٠ أغسطس ٢٠٢٦ وكان غلط.
//
// **الإصلاح**: المقارنة بقت **لنفس الساعة**. أوردرات النهاردة لحد دلوقتي
// مقابل أوردرات نفس اليوم من الأسابيع اللي فاتت **لحد نفس الساعة**.
// وقبل `MIN_HOUR` مافيش تنبيه خالص — الفرق في أول الصبح رقمين صغيرين
// والفرق بينهم صدفة مش عطل.
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

/**
 * ⚠️⚠️ **قبل الساعة دي بتوقيت مصر مافيش تنبيه.**
 *
 * الصبح بدري الرقمين بيبقوا صغيرين (١ مقابل ٢)، والفرق بينهم صدفة مش عطل.
 * والساعة ٢ الضهر بيكون عدّى نُص يوم الشغل — كفاية إن الفرق يبقى حقيقي.
 */
export const MIN_HOUR = 14;

export type DropOrder = {
  orderStatus: string | null;
  /** ⚠️ **بالساعة مش باليوم بس** — المقارنة محتاجة الوقت */
  orderDate: string | null;
};

export type DropCheck = {
  /** أوردرات النهاردة لحد دلوقتي */
  today: number;
  /** متوسط نفس اليوم من الأسابيع اللي فاتت **لحد نفس الساعة** */
  usual: number;
  /** كام أسبوع دخل في المتوسط */
  weeks: number;
  /** النزول ٪ — و`null` لو مفيش مقارنة */
  dropPercent: number | null;
  /** ننبّه؟ */
  alert: boolean;
  /** لسه بدري على الحكم؟ */
  tooEarly: boolean;
};

/** الساعة بتوقيت مصر */
function cairoHour(at: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      hour: "2-digit",
      hour12: false,
    }).format(at)
  );
}

/** اليوم بتوقيت مصر `2026-08-20` */
function cairoDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(at);
}

/** يوم الأسبوع بتوقيت مصر */
function cairoWeekdayOf(at: Date): number {
  return new Date(`${cairoDay(at)}T00:00:00Z`).getUTCDay();
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * المبيعات النهاردة مقابل نفس اليوم من الأسابيع اللي فاتت — **لنفس الساعة**.
 *
 * `now` بيتبعت جوّه عشان الاختبار يبقى ثابت.
 */
export function checkDrop(
  orders: DropOrder[],
  now: Date,
  weeksBack = 4
): DropCheck {
  const hour = cairoHour(now);
  const today = cairoDay(now);
  const todayWeekday = cairoWeekdayOf(now);

  const early = hour < MIN_HOUR;

  /**
   * أوردرات يوم معيّن **لحد ساعة معيّنة**.
   *
   * ⚠️ **الساعة بتوقيت مصر** — الأوردر الساعة ١١ بالليل بتوقيت مصر بيبقى
   * اليوم اللي بعده بالتوقيت العالمي، ولو حسبناه كده اليوم بيبان أفقر
   * والتنبيه بيرن على وهم.
   */
  const countUntil = (day: string, untilHour: number): number => {
    let n = 0;
    for (const o of orders) {
      if (NOT_A_SALE.includes(String(o.orderStatus))) continue;
      const at = parse(o.orderDate);
      if (!at) continue;
      if (cairoDay(at) !== day) continue;
      if (cairoHour(at) > untilHour) continue;
      n++;
    }
    return n;
  };

  const past: number[] = [];
  for (let w = 1; w <= weeksBack; w++) {
    const at = new Date(now.getTime() - w * 7 * 86_400_000);
    if (cairoWeekdayOf(at) !== todayWeekday) continue;
    past.push(countUntil(cairoDay(at), hour));
  }

  const todayCount = countUntil(today, hour);
  const usual =
    past.length > 0 ? past.reduce((s, n) => s + n, 0) / past.length : 0;

  const enough = !early && past.length >= MIN_WEEKS && usual >= MIN_AVERAGE;
  const dropPercent = enough ? Math.round((1 - todayCount / usual) * 100) : null;

  return {
    today: todayCount,
    usual: Math.round(usual * 10) / 10,
    weeks: past.length,
    dropPercent,
    alert: enough && todayCount < usual * (1 - DROP_THRESHOLD),
    tooEarly: early,
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
    `${check.today} أوردر، والمعتاد يوم ${day} في نفس الوقت حوالي ${check.usual}`,
    "ده بيحصل عادة لما الموقع يقع، أو الإعلان يقف، أو المزامنة تتعطّل",
  ].join("\n");
}
