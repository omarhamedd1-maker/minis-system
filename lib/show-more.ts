/**
 * حد العرض — مش حد البيانات.
 *
 * ⚠️⚠️ **الصفحة بتجيب صفوفها وبتحسب منها كلها، والرقم ده بيقصّ المعروض بس.**
 * أي حساب (إجمالي · عدد · شرايح) لازم يفضل على القايمة الكاملة — لو اتحسب على
 * المقصوص هيطلع رقم غلط من غير ما حد ياخد باله.
 */
export const SHOW_STEP = 50;

/**
 * أقصى عدد بيتعرض مرة واحدة.
 *
 * ⚠️ **ده سقف سوبابيز نفسه** — القايمة المعروضة بتتجاب بـ`.limit(showCount)`،
 * وأي رقم فوق ١٠٠٠ كان بيرجع ١٠٠٠ بالصمت و«عرض المزيد» كان بيفضل ظاهر
 * من غير ما يزوّد حاجة (NEXT §٣٣). فوق الألف: الفلاتر.
 */
export const SHOW_MAX = 1000;

export function resolveShowCount(
  show: string | undefined,
  step: number = SHOW_STEP,
  max: number = SHOW_MAX
): number {
  const n = Math.floor(Number(show));
  if (!Number.isFinite(n)) return step;
  return Math.min(Math.max(n, step), max);
}
