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

export type PresetKey = "7d" | "30d" | "month";
export type PeriodKey = PresetKey | "all" | "custom";

export const PERIOD_PRESETS: { key: PresetKey; label: string }[] = [
  { key: "7d", label: "آخر ٧ أيام" },
  { key: "30d", label: "آخر ٣٠ يوم" },
  { key: "month", label: "الشهر ده" },
];

/** «كل الوقت» — بس في القوايم اللي محتاجاها (مش في الحسابات) */
export const ALL_LABEL = "كل الوقت";

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
 * ⚠️ **اللينكات القديمة بتفضل شغالة:** `today` ← مدة مخصصة يوم النهارده ·
 * `week` ← آخر ٧ أيام. أي قيمة تانية مش معروفة (`3m` · `year`) بترجع للافتراضي.
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
  if (!from && input.period === "today") from = to = today;
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
    raw === "7d" || raw === "30d" || raw === "month"
      ? raw
      : raw === "all" && allowAll
        ? "all"
        : opts.defaultKey;

  if (key === "all") return { key, start: null, end: today, label: ALL_LABEL, days: null };

  const start =
    key === "7d"
      ? shiftDays(today, -6)
      : key === "30d"
        ? shiftDays(today, -29)
        : today.slice(0, 8) + "01";
  const label = PERIOD_PRESETS.find((p) => p.key === key)!.label;
  return { key, start, end: today, label, days: daysBetween(start, today) };
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
 * ⚠️ **«الشهر ده» بيتقارن بنفس الأيام من الشهر اللي فات** مش بالشهر كله —
 * يوم ١٠ في الشهر مايتقارنش بـ٣٠ يوم. و«كل الوقت» مالهاش قبل.
 */
export function previousPeriod(
  range: ResolvedPeriod
): { start: string; end: string; label: string } | null {
  if (!range.start || !range.days) return null;
  if (range.key === "month") {
    const start = shiftDays(range.start, -1).slice(0, 8) + "01";
    const lastOfPrev = shiftDays(range.start, -1);
    const end = shiftDays(start, range.days - 1);
    return {
      start,
      end: end > lastOfPrev ? lastOfPrev : end,
      label: "نفس الأيام من الشهر اللي فات",
    };
  }
  return {
    start: shiftDays(range.start, -range.days),
    end: shiftDays(range.start, -1),
    label:
      range.key === "7d"
        ? "الـ٧ أيام اللي قبلها"
        : range.key === "30d"
          ? "الـ٣٠ يوم اللي قبلها"
          : "المدة اللي قبلها",
  };
}
