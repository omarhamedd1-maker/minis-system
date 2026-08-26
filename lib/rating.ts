// ==========================================================================
// التقييم بعد التسليم — نجمة لـ٥ مربوطة بالمنتج
// --------------------------------------------------------------------------
// رسالة «وصلك؟» بتتبعت خلاص بعد التسليم (`lib/followup.ts`)، والعميل بيرد
// بكلام في واتساب — كلام مابيتسجّلش في أي مكان. فاللي بيشتكي وده بيتكرر
// على نفس المنتج، محدش بيربط.
//
// ⚠️⚠️ **التقييم بيتربط بالمنتج مش بالأوردر بس.** «العميل مبسوط» رقم
// مالوش فايدة؛ «الشكل ده متوسطه ٢٫١ من ١٤ تقييم» رقم بيتعمل عليه حاجة.
//
// ⚠️ **والتقييم من غير حساب** — العميل مالوش حساب عندنا، فاللينك بيفتح
// صفحة فيها نجوم وخلاص. أي تسجيل دخول = صفر تقييمات.
//
// ⚠️ **ومرة واحدة لكل أوردر.** لو العميل قدر يقيّم عشر مرات، أول واحد
// زعلان بيقلب متوسط المنتج لوحده.
//
// **الملف ده صافي** — بياخد تقييمات وبيرجّع متوسطات.
// ==========================================================================

/** أقل عدد تقييمات عشان المتوسط يتعرض */
export const MIN_RATINGS = 3;

/** التقييم اللي تحته بيتحسب شكوى */
export const LOW_STARS = 3;

export type Rating = {
  orderId: string;
  /** ١ لـ٥ */
  stars: number;
  /** كلام العميل — اختياري */
  comment: string | null;
  /** الأشكال اللي كانت في الأوردر */
  variantIds: string[];
  createdAt: string | null;
};

export type ProductRating = {
  variantId: string;
  /** المتوسط — و`null` لو الأرقام قليلة */
  average: number | null;
  count: number;
  /** كام تقييم تحت الحد */
  low: number;
};

/** التقييم ده مقبول؟ */
export function checkStars(value: unknown): number | null {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

/**
 * متوسط كل شكل.
 *
 * ⚠️⚠️ **الأوردر بيقيّم كل أشكاله بنفس النجوم.** العميل بيقيّم تجربته
 * مش كل منتج لوحده، فلو الأوردر فيه تلات حاجات، التلاتة بياخدوا نفس
 * الرقم. ده تقريب — بس **مذكور في الشاشة** عشان الرقم يتقرا صح.
 *
 * ⚠️ **والمتوسط مابيتعرضش تحت `MIN_RATINGS`** — تقييم واحد بنجمة معناه
 * «١ من ٥» على الشكل كله، ورقم زي ده بيخوّف وهو مالوش معنى.
 */
export function ratingsByProduct(ratings: Rating[]): ProductRating[] {
  const by = new Map<string, { sum: number; count: number; low: number }>();

  for (const r of ratings) {
    const stars = checkStars(r.stars);
    if (stars === null) continue;

    for (const v of r.variantIds) {
      if (!v) continue;
      const cur = by.get(v) ?? { sum: 0, count: 0, low: 0 };
      cur.sum += stars;
      cur.count++;
      if (stars < LOW_STARS) cur.low++;
      by.set(v, cur);
    }
  }

  return [...by.entries()]
    .map(([variantId, v]) => ({
      variantId,
      average:
        v.count >= MIN_RATINGS ? Math.round((v.sum / v.count) * 10) / 10 : null,
      count: v.count,
      low: v.low,
    }))
    .sort((a, b) => {
      // ⚠️ **الأقل تقييمًا الأول** — ده اللي محتاج نظرة. واللي مالوش متوسط
      // بينزل تحت عشان مايتصدّرش بصفر.
      if (a.average === null && b.average === null) return b.count - a.count;
      if (a.average === null) return 1;
      if (b.average === null) return -1;
      return a.average - b.average;
    });
}

export type Overall = {
  average: number | null;
  count: number;
  /** كام تقييم تحت الحد */
  low: number;
  /** نسبة اللي تحت الحد — و`null` لو الأرقام قليلة */
  lowRate: number | null;
};

/** المتوسط العام */
export function overallRating(ratings: Rating[]): Overall {
  const clean = ratings
    .map((r) => checkStars(r.stars))
    .filter((s): s is number => s !== null);

  const low = clean.filter((s) => s < LOW_STARS).length;

  return {
    average:
      clean.length >= MIN_RATINGS
        ? Math.round((clean.reduce((s, n) => s + n, 0) / clean.length) * 10) / 10
        : null,
    count: clean.length,
    low,
    lowRate:
      clean.length >= MIN_RATINGS
        ? Math.round((low / clean.length) * 1000) / 10
        : null,
  };
}

/** نجوم للعرض — «★★★☆☆» */
export function starsText(n: number): string {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(v) + "☆".repeat(5 - v);
}

/**
 * لينك التقييم — نفس معرّف الأوردر بتاع صفحة التتبع.
 *
 * ⚠️ **بمعرّف الأوردر مش برقمه** — رقم الأوردر متسلسل، فأي حد يقدر
 * يخمّن أرقام ويقيّم أوردرات مش بتاعته.
 *
 * ⚠️ **نفس شكل `trackingLink`** — نفس القواعد بالظبط (العنوان الفاضي
 * بيرجع للدومين الأساسي، والمعرّف الفاضي بيرجّع `null`). الشكلين
 * المختلفين لنفس الحاجة بيخلّوا واحد منهم يقع في مكان والتاني لأ.
 */
export function ratingLink(
  orderId: string | null | undefined,
  origin?: string | null
): string | null {
  const id = String(orderId ?? "").trim();
  if (!id) return null;
  const base = String(origin ?? "").trim() || "https://minis-system.vercel.app";
  const clean = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${clean}/r/${encodeURIComponent(id)}`;
}
