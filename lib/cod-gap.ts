// ==========================================================================
// التحصيل عندنا مقابل التحصيل عند بوسطة
// --------------------------------------------------------------------------
// التنبيه على الفرق ده موجود من زمان (`lib/bosta/cod-check.ts`) وبيوصل على
// الموبايل ساعة ما يحصل. الناقص كان **مكان بيجمعهم**: التنبيه بيعدّي، والفرق
// بيفضل.
//
// عند مينيز (٢٠ أغسطس ٢٠٢٦): **١٣ أوردر بفرق ١١٬٣٩٠ جنيه**.
//
// ⚠️⚠️ **مافيش تصليح تلقائي — وده قرار مقصود.** أحيانًا رقمنا هو الغلط،
// وأحيانًا الاتنين صح (شحنة جزئية)، وبوسطة بتحدّد عدد مرات تعديل التحصيل
// فالأوتوماتيك بياكلهم.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

/** فرق أقل من ده تقريب مش مشكلة */
const TOLERANCE = 1;

/** الحالات اللي الفرق فيها خلاص عدّى — الفلوس اتحصّلت أو رجعت */
const SETTLED = ["delivered", "returned", "returned_after_delivery", "cancelled"];

export type GapOrder = {
  orderNumber: string | null;
  orderStatus: string | null;
  bostaCod: number | null;
  bostaCollected?: boolean | null;
  itemsTotal: number;
  discount: number;
  shipping: number;
};

export type GapRow = {
  orderNumber: string | null;
  /** إجمالينا */
  ours: number;
  /** اللي بوسطة هتحصّله */
  bosta: number;
  /** بوسطة − عندنا */
  diff: number;
  /** الشحنة لسه في السكة؟ يعني الفرق لسه ينفع يتظبط */
  fixable: boolean;
};

export type GapReport = {
  rows: GapRow[];
  /** مجموع الفروق بالقيمة المطلقة */
  total: number;
  /** كام واحد لسه ينفع يتظبط */
  fixable: number;
};

/**
 * الأوردرات اللي رقمنا فيها مختلف عن بوسطة.
 *
 * بيرجّع **الأكبر فرقًا الأول** — ده اللي بيوجع أكتر.
 */
export function codGaps(orders: GapOrder[]): GapReport {
  const rows: GapRow[] = [];

  for (const o of orders) {
    const bosta = Number(o.bostaCod ?? 0);
    // ⚠️ **الشحنة اللي مالهاش تحصيل مش فرق** — دي شحنة مدفوعة أو مالهاش رقم
    if (!(bosta > 0)) continue;

    const ours =
      (Number(o.itemsTotal) || 0) -
      (Number(o.discount) || 0) +
      (Number(o.shipping) || 0);

    const diff = Math.round((bosta - ours) * 100) / 100;
    if (Math.abs(diff) <= TOLERANCE) continue;

    rows.push({
      orderNumber: o.orderNumber,
      ours: Math.round(ours),
      bosta: Math.round(bosta),
      diff: Math.round(diff),
      // ⚠️ اللي اتحصّل أو خلص خلاص مافيش تعديل ينفع عليه
      fixable:
        !o.bostaCollected && !SETTLED.includes(String(o.orderStatus)),
    });
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return {
    rows,
    total: rows.reduce((s, r) => s + Math.abs(r.diff), 0),
    fixable: rows.filter((r) => r.fixable).length,
  };
}
