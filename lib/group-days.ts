/**
 * ==========================================================================
 * التجميع بالتاريخ — قاعدة واحدة لكل القوايم
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **اليوم اللي فيه صف واحد مالوش عنوان** (قرار عمر ١٦ سبتمبر، على
 * صفحة الفلوس): العنوان بيوفّر قراية لما يبقى في اليوم كذا صف، ومع صف
 * واحد بيزوّد سطر ونص — التجريبي طوّل من ٨,١٣٥ لـ١١,٠٥٣px قبل ما يتصلّح.
 *
 * اليوم المقصوص (اللي لسه فيه صفوف ماتجابتش) بياخد عنوان دايمًا، عشان
 * «ده جزء من اليوم» لازم يتقال.
 *
 * **الملف ده صافي** — بياخد صفوف وبيرجّع أيام.
 * ==========================================================================
 */

export type DayGroup<T> = {
  /** YYYY-MM-DD */
  day: string;
  rows: T[];
  /** مجموع الصفوف في اليوم (فلوس) */
  total: number;
  /** آخر يوم في الصفحة ممكن يكون ناقص */
  partial: boolean;
};

export const dayOf = (value: string | null | undefined) => (value ?? "").slice(0, 10);

/** اليوم يستاهل عنوان؟ */
export const dayHasHeader = (day: { rows: unknown[]; partial: boolean }) =>
  day.rows.length > 1 || day.partial;

/**
 * @param rows مترتبة زي ما هتتعرض
 * @param hasMore فيه صفوف أقدم ماتجابتش — آخر يوم يتعلّم «مقصوص»
 */
export function groupDays<T>(
  rows: T[],
  opts: {
    dateOf: (row: T) => string | null | undefined;
    amountOf?: (row: T) => number;
    hasMore?: boolean;
  }
): DayGroup<T>[] {
  const days: DayGroup<T>[] = [];
  for (const row of rows) {
    const day = dayOf(opts.dateOf(row));
    let current = days[days.length - 1];
    if (!current || current.day !== day) {
      current = { day, rows: [], total: 0, partial: false };
      days.push(current);
    }
    current.rows.push(row);
    current.total += opts.amountOf ? Number(opts.amountOf(row)) || 0 : 0;
  }
  if (opts.hasMore && days.length > 0) days[days.length - 1].partial = true;
  return days;
}
