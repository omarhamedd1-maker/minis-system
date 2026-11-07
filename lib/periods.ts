// ==========================================================================
// الفترات — مصدر واحد لكل الصفحات (المرحلة ٢، الخطوة ١)
// --------------------------------------------------------------------------
// قبل كده كل صفحة كانت معرّفة فتراتها لوحدها: الداشبورد (النهارده · الشهر ·
// ٣ شهور · السنة) والأوردرات (الكل · النهارده · ٧ أيام · …) والمصاريف (الشهر ·
// ٣ شهور · السنة · الكل) — تلات مجموعات بتلات افتراضيات.
//
// ⚠️ **ممنوع صفحة تعرّف فتراتها بنفسها** — فيه اختبار بيقع لو ده حصل
// (`lib/periods.test.ts`).
//
// **الملف ده صافي** — النهارده بيتبعت من برّه عشان الاختبار يبقى ثابت.
// ==========================================================================

export type PresetKey = "today" | "7d" | "30d" | "month";
export type PeriodKey = PresetKey | "all" | "custom";

// «النهارده» رجعت اختيار ثابت في كل الصفحات (قرار عمر ١٧ سبتمبر) — كانت
// متاحة من «مدة مخصصة» بس.
export const PERIOD_PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "النهارده" },
  { key: "7d", label: "آخر ٧ أيام" },
  { key: "30d", label: "آخر ٣٠ يوم" },
  { key: "month", label: "الشهر ده" },
];

/** «كل الوقت» — بس في القوايم اللي محتاجاها (مش في الحسابات) */
export const ALL_LABEL = "كل الوقت";

/**
 * ⚠️⚠️ **الفترة اللي أي صفحة بتفتح عليها — ثابت واحد، مش مكتوب في كل مكان.**
 *
 * **«الشهر ده» بطلب عمر (٧ نوفمبر ٢٠٢٦).** التقفيل بيتعمل بالشهر،
 * فالرقم اللي بيفتح عليه يبقى هو نفس الرقم اللي بيحاسب عليه. «آخر ٣٠
 * يوم» كانت بتخلط شهرين على طول: يوم ٥ نوفمبر = ٥ أيام من نوفمبر و٢٥
 * من أكتوبر في رقم واحد، ورقم كده مابتقفلش بيه.
 *
 * ومقابله معروف ومقبول: **أول الشهر الشاشة بتبان شبه فاضية** — يوم ٢
 * بتحسب يومين. «آخر ٣٠ يوم» ماكانتش بتفضى أبدًا لأنها بتمشي مع
 * النهارده. ده فرق في المعنى مش عطل.
 *
 * ⚠️ **والثابت مهم مش رفاهية.** الداشبورد بتتحسب في **مكانين**:
 * السيرفر في `app/(dashboard)/page.tsx`، وكروت الفلوس الحيّة في
 * `components/LiveMoneyCards.tsx` اللي بتعيد الحساب في المتصفح كل
 * شوية. كان مكتوب `"30d"` في الاتنين بإيد والتعليق بس هو اللي رابطهم —
 * ولو واحد اتغيّر من غير التاني، نفس الشاشة بتوري رقمين مختلفين لنفس
 * الحاجة ومحدش يعرف مين الصح. فيه اختبار بيقع لو رجعت القيمة مكتوبة
 * بإيد في أي من الاتنين.
 */
export const DEFAULT_PERIOD: PresetKey = "month";

export type ResolvedPeriod = {
  key: PeriodKey;
  /** أول يوم (YYYY-MM-DD) — `null` = من غير حد */
  start: string | null;
  /** آخر يوم (YYYY-MM-DD) */
  end: string;
  label: string;
  /** المدة المخصصة — بس لو key = custom */
  from?: string;
  to?: string;
  /** عدد الأيام — `null` لو «كل الوقت» */
  days: number | null;
};

const isDate = (v?: string | null): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function shiftDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return (
    Math.round(
      (new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) /
        86_400_000
    ) + 1
  );
}

const dayFormat = new Intl.DateTimeFormat("ar-EG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const fmtDay = (d: string) => dayFormat.format(new Date(d + "T12:00:00Z"));

/**
 * بيحوّل اللي في اللينك لفترة.
 *
 * ⚠️ **اللينكات القديمة بتفضل شغالة:** `week` ← آخر ٧ أيام. أي قيمة تانية مش معروفة (`3m` · `year`) بترجع للافتراضي.
 */
export function resolvePeriod(
  input: { period?: string | null; from?: string | null; to?: string | null },
  opts: { today: string; defaultKey: PresetKey | "all"; allowAll?: boolean }
): ResolvedPeriod {
  const { today } = opts;
  const allowAll = opts.allowAll || opts.defaultKey === "all";

  // مدة مخصصة — يوم واحد أو من لـ
  let from = isDate(input.from) ? input.from : undefined;
  let to = isDate(input.to) ? input.to : from;
  if (from && to) {
    if (to < from) [from, to] = [to, from];
    return {
      key: "custom",
      start: from,
      end: to,
      from,
      to,
      label: from === to ? fmtDay(from) : `من ${fmtDay(from)} لـ ${fmtDay(to)}`,
      days: daysBetween(from, to),
    };
  }

  const raw = input.period === "week" ? "7d" : input.period;
  const key: PresetKey | "all" =
    raw === "today" || raw === "7d" || raw === "30d" || raw === "month"
      ? raw
      : raw === "all" && allowAll
        ? "all"
        : opts.defaultKey;

  if (key === "all") return { key, start: null, end: today, label: ALL_LABEL, days: null };

  const start =
    key === "today"
      ? today
      : key === "7d"
      ? shiftDays(today, -6)
      : key === "30d"
        ? shiftDays(today, -29)
        : today.slice(0, 8) + "01";

  /**
   * ⚠️ **«الشهر ده» بينتهي بآخر يوم في الشهر مش بالنهارده** (قرار عمر
   * ٧ نوفمبر ٢٠٢٦). يعني الشهر كامل من يوم ١ لآخر يوم فيه.
   *
   * الأيام الجاية فاضية طبعًا — مفيش أوردرات في المستقبل — فالأرقام
   * هي هي. اللي بيتغيّر إن الشهر بيتقارن بشهر كامل زيه، والمدى اللي
   * على الشاشة بيبقى الشهر زي ما هو مكتوب في أي تقفيل.
   */
  const end =
    key === "month" ? lastDayOfMonth(today) : today;
  const label = PERIOD_PRESETS.find((p) => p.key === key)!.label;
  return { key, start, end, label, days: daysBetween(start, end) };
}

/** آخر يوم في شهر التاريخ ده (YYYY-MM-DD) */
export function lastDayOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  // اليوم صفر من الشهر اللي بعده = آخر يوم في الشهر ده
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * لينك بفترة جديدة وباقي الفلاتر زي ما هي.
 *
 * ⚠️ **الافتراضي مابيتكتبش في اللينك** — عشان اللينك النضيف يفضل نضيف، وعشان
 * الصفحة لو غيّرت افتراضيها بعدين اللينكات القديمة تمشي معاها.
 */
export function periodHref(
  basePath: string,
  query: Record<string, string | undefined>,
  next: { key: PresetKey | "all" } | { from: string; to: string } | { clear: true },
  defaultKey: PresetKey | "all",
  /** فلاتر بتتصفّر لما الفترة تتغير (زي «عرض المزيد») */
  resetKeys: string[] = []
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    if (k === "period" || k === "from" || k === "to" || resetKeys.includes(k)) continue;
    p.set(k, v);
  }
  if ("key" in next) {
    if (next.key !== defaultKey) p.set("period", next.key);
  } else if ("from" in next) {
    const [lo, hi] = next.from <= next.to ? [next.from, next.to] : [next.to, next.from];
    p.set("from", lo);
    p.set("to", hi);
  }
  const qs = p.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * الفترة اللي قبلها بنفس الطول — للمقارنة («↓ ٤٠٪ عن اللي قبلها»).
 *
 * ⚠️ **«الشهر ده» بقى شهر كامل، فبيتقارن بالشهر اللي فات كامل** (٧ نوفمبر
 * ٢٠٢٦). قبل كده كان بينتهي بالنهارده، فكان لازم يتقارن بنفس عدد الأيام
 * من الشهر اللي فات عشان يوم ١٠ مايتقارنش بـ٣٠ يوم. و«كل الوقت» مالهاش قبل.
 */
export function previousPeriod(
  range: ResolvedPeriod
): { start: string; end: string; label: string } | null {
  if (!range.start || !range.days) return null;
  if (range.key === "month") {
    // الشهر كامل بيتقارن بالشهر اللي قبله كامل — من يوم ١ لآخر يوم
    const lastOfPrev = shiftDays(range.start, -1);
    return {
      start: lastOfPrev.slice(0, 8) + "01",
      end: lastOfPrev,
      label: "الشهر اللي فات",
    };
  }
  return {
    start: shiftDays(range.start, -range.days),
    end: shiftDays(range.start, -1),
    label:
      range.key === "today"
        ? "امبارح"
        : range.key === "7d"
        ? "الـ٧ أيام اللي قبلها"
        : range.key === "30d"
          ? "الـ٣٠ يوم اللي قبلها"
          : "المدة اللي قبلها",
  };
}
