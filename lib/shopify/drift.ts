// ==========================================================================
// أوردرات إجماليها عندنا مختلف عن شوبيفاي — القرار
// --------------------------------------------------------------------------
// **الاستيراد بيضيف بس.** الأوردر اللي دخل مرة، أي تعديل بعد كده عند
// شوبيفاي (بند اتشال · كمية اتغيّرت · سعر اتظبّط) **مابيوصلش خالص**.
//
// ⚠️⚠️ **وماينفعش نزامنهم تلقائي.** جرّبنا نشوف مين الصح في ٦ أوردرات
// حقيقية في مينيز (١٨ أغسطس ٢٠٢٦)، والحكم كان **اللي بوسطة حصّلته فعلًا**:
//
//   | الأوردر | عندنا | شوبيفاي | بوسطة حصّلت | مين الصح |
//   |---|---|---|---|---|
//   | ١٢٩٧ | ١٣٨٨ | ٧٣٩  | ٧٣٩  | شوبيفاي |
//   | ١٢٨٧ | ٢٣٨٧ | ١٣٨٨ | ١٣٨٨ | شوبيفاي |
//   | ١٣٤٣ | ٣٠٤٠ | ٣١٥٨ | ٣١٥٨ | شوبيفاي |
//   | ١٣٦٠ | ٣٦٩٠ | ٣٩٨٤ | ٣٦٩٠ | **إحنا** |
//
// يعني **مش اتجاه واحد**: شوبيفاي ممكن تكون هي القديمة. فالنسخ منها
// أوتوماتيك كان هيبوّظ أوردرات صح.
//
// **اللي بيتعمل هنا**: الفرق بيتحسب ويتعرض، والقرار لواحد يشوفه بعينه.
// السكوت عليه هو المشكلة، مش وجوده.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

export type OurOrderTotal = {
  orderNumber: string;
  orderStatus: string;
  /** مجموع البنود قبل الخصم والشحن */
  itemsTotal: number;
  discount: number;
  shipping: number;
  /** اللي بوسطة اتقالها تحصّله — الحكم لما يكون موجود */
  bostaCod: number | null;
  bostaCollected: boolean;
};

export type ShopifyOrderTotal = {
  orderNumber: string;
  cancelled: boolean;
  total: number;
};

export type DriftRow = {
  orderNumber: string;
  orderStatus: string;
  ours: number;
  shopify: number;
  diff: number;
  /**
   * اللي بوسطة حصّلته فعلًا — لما يكون موجود، ده اللي بيحسم مين الصح.
   * `null` لما الشحنة مش متحصّلة أو مفيش شحنة.
   */
  collected: number | null;
  /** مين مطابق للفلوس اللي اتحصّلت */
  matches: "ours" | "shopify" | "neither" | "unknown";
};

/** جنيه واحد فرق مش فرق — الكسور بتيجي من تقريب شوبيفاي */
const TOLERANCE = 1;

export function ourTotal(o: OurOrderTotal): number {
  return o.itemsTotal - Number(o.discount ?? 0) + Number(o.shipping ?? 0);
}

/**
 * الأوردرات اللي إجماليها مختلف.
 *
 * **الملغي بيتخطّى**: إجماليه عند شوبيفاي بيبقى صفر بعد الإلغاء، فمقارنته
 * بإجمالينا بتطلّع فرق وهمي لكل أوردر ملغي.
 */
export function findDrift(
  ours: OurOrderTotal[],
  shopify: ShopifyOrderTotal[]
): DriftRow[] {
  const byNumber = new Map<string, ShopifyOrderTotal>();
  for (const s of shopify) {
    byNumber.set(String(s.orderNumber).trim(), s);
  }

  const out: DriftRow[] = [];
  for (const o of ours) {
    const s = byNumber.get(String(o.orderNumber).trim());
    if (!s || s.cancelled) continue;
    if (o.orderStatus === "cancelled") continue;

    const mine = ourTotal(o);
    const diff = mine - s.total;
    if (Math.abs(diff) <= TOLERANCE) continue;

    // **الفلوس اللي اتحصّلت هي الحكم** — بس لما تكون اتحصّلت فعلًا
    const collected =
      o.bostaCollected && typeof o.bostaCod === "number" && o.bostaCod > 0
        ? o.bostaCod
        : null;

    let matches: DriftRow["matches"] = "unknown";
    if (collected !== null) {
      const okOurs = Math.abs(mine - collected) <= TOLERANCE;
      const okShopify = Math.abs(s.total - collected) <= TOLERANCE;
      matches = okOurs ? "ours" : okShopify ? "shopify" : "neither";
    }

    out.push({
      orderNumber: o.orderNumber,
      orderStatus: o.orderStatus,
      ours: mine,
      shopify: s.total,
      diff,
      collected,
      matches,
    });
  }

  // الأكبر فرقًا الأول — ده اللي بيستاهل عين
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
