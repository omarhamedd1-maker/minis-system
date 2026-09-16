/**
 * حد العرض — مش حد البيانات.
 *
 * ⚠️⚠️ **الصفحة بتجيب صفوفها وبتحسب منها كلها، والرقم ده بيقصّ المعروض بس.**
 * أي حساب (إجمالي · عدد · شرايح) لازم يفضل على القايمة الكاملة — لو اتحسب على
 * المقصوص هيطلع رقم غلط من غير ما حد ياخد باله.
 */
export const SHOW_STEP = 50;

/** أقصى عدد ينفع يتعرض مرة واحدة — سقف للأمان مش قاعدة منتج */
const SHOW_MAX = 5000;

export function resolveShowCount(
  show: string | undefined,
  step: number = SHOW_STEP,
  max: number = SHOW_MAX
): number {
  const n = Math.floor(Number(show));
  if (!Number.isFinite(n)) return step;
  return Math.min(Math.max(n, step), max);
}
