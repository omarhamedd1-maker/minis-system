/**
 * ==========================================================================
 * كل الصفوف — صفحة صفحة
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **سوبابيز بيرجّع ١٠٠٠ صف بالكتير مهما كتبت في `.limit()`.**
 * اتقاس ١٦ سبتمبر: `.limit(5000)` على جدول فيه ٥,٢٩٩ صف رجّع ١٠٠٠ بالظبط،
 * من غير أي خطأ. أي قراية محتاجة «كل الصفوف» لازم تعدّي من هنا.
 * ==========================================================================
 */

/** حجم الصفحة = سقف سوبابيز. أقل صفحة من ده معناها إن الصفوف خلصت */
export const PAGE_SIZE = 1000;

/**
 * بيجيب كل الصفحات لحد ما صفحة ترجع أقل من الحجم.
 * ⚠️ **أي خطأ بيوقف** — رقم من نص الصفوف أوحش من مفيش رقم.
 * ⚠️ **الاستعلام لازم يكون مترتب ترتيب ثابت** — من غيره الصفحات بتتداخل.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

type PageResponse = { data: unknown; error: { message: string } | null };

type Pageable<R> = {
  range(from: number, to: number): PromiseLike<R>;
  order(column: string, options?: { ascending?: boolean }): unknown;
};

/**
 * نفس الاستعلام بتاعك — بس بيجيب كل الصفوف. بيرجّع نفس شكل الرد
 * (`{ data, error }`)، فالكود اللي بعده مايتغيّرش.
 *
 * - ⚠️ **ماتكتبش `.limit()` على الاستعلام** — الصفحات هي اللي بتحدد.
 * - ⚠️ **الفلاتر كلها قبل `allRows`** — اللي بيرجع رد مش استعلام.
 * - بيزوّد ترتيب بـ`id` في الآخر عشان الصفحات ماتتداخلش (لو الجدول مالوش
 *   `id` أو مترتب بيه خلاص، ابعت `null`).
 * - أي خطأ في أي صفحة بيرجع زي ما هو — مفيش نص نتيجة.
 */
export async function allRows<R extends PageResponse>(
  query: PromiseLike<R>,
  orderKey: string | null = "id"
): Promise<R> {
  // `overrideTypes` بيضيّق النوع بس — الكائن نفسه لسه استعلام سوبابيز
  const q = query as unknown as Partial<Pageable<R>>;
  if (typeof q.range !== "function" || typeof q.order !== "function") {
    throw new Error("allRows محتاج استعلام سوبابيز مش رد");
  }
  if (orderKey) q.order(orderKey);
  const rows: unknown[] = [];
  let last: R | null = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const res = await q.range(from, from + PAGE_SIZE - 1);
    if (res.error) return res;
    const page = Array.isArray(res.data) ? res.data : [];
    rows.push(...page);
    last = res;
    if (page.length < PAGE_SIZE) break;
  }
  return { ...(last as R), data: rows };
}
