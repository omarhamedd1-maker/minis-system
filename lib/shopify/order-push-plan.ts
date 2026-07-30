// ==========================================================================
// القرار: إيه اللي لازم يتغيّر في الأوردر عند شوبيفاي
// --------------------------------------------------------------------------
// **الملف ده صافي تمامًا** — مافيش شبكة ولا قاعدة بيانات ولا أي استيراد.
// نفس فكرة `lib/bosta/reconcile.ts`: اللي بيقرر منفصل عن اللي بيتصل، عشان
// ينفع يتختبر بالأرقام، وعشان سكريبت المقارنة يقدر يحمّله لوحده.
//
// شوبيفاي **مابتخليكش تغيّر سعر بند** — بتخليك تحط عليه خصم بس. فلو عايزين
// سعر أقل من سعر الكتالوج بنحط خصم بالنسبة، ولو عايزين سعر أعلى مافيش حيلة
// (بنسجّله في `cantRaise`).
// ==========================================================================

/** اسم الخصم بتاعنا عند شوبيفاي — بيه بنعرف خصمنا من خصم العميل */
export const PRICE_EDIT_LABEL = "تعديل سعر من Minis System";

/** الأوردر اللي مش جاي من شوبيفاي بيبدأ بواحدة من دول */
export const NOT_SHOPIFY_PREFIXES = ["import-", "manual-"];

export type OurItem = {
  shopifyVariantId: string | null;
  quantity: number;
  salePrice: number;
};

export type ShopLine = {
  shopifyVariantId: string;
  /** الكمية اللي بنقارن بيها */
  quantity: number;
  /** سعر الكتالوج — الخصم بيتحسب منه */
  basePrice: number;
  /** السعر بعد الخصومات */
  effectivePrice: number;
};

export type PushPlan = {
  /** بنود كميتها غلط */
  onlyQty: { svid: string; qty: number }[];
  /** بنود سعرها محتاج خصم */
  priceFix: { svid: string; target: number; base: number }[];
  /** بنود عندنا ومش عند شوبيفاي */
  toAdd: { svid: string; qty: number; price: number }[];
  /** بنود عند شوبيفاي ومش عندنا */
  toRemove: string[];
  /** سعرنا أعلى من سعر الكتالوج — شوبيفاي مابتسمحش نرفعه */
  cantRaise: { svid: string; system: number; base: number }[];
};

/**
 * عدد التغييرات اللي **ينفع** نعملها.
 *
 * `cantRaise` **مش** منها لأنها مستحيلة عند شوبيفاي أصلًا — بس دي بالظبط
 * الحتة اللي كانت بتخلّي الدالة القديمة تقول "مفيش فرق" وفيه فرق: كانت
 * بترجّع نجاح وعدّاد صفر وتسيب `cantRaise` في الرد ومحدش بيبصله. فالعدّاد
 * فضل زي ما هو، والحل إن اللي بينادي **لازم** يبصّ على `cantRaise` كمان.
 */
export function changeCount(plan: PushPlan): number {
  return (
    plan.onlyQty.length +
    plan.priceFix.length +
    plan.toAdd.length +
    plan.toRemove.length
  );
}

/**
 * البنود اللي **إحنا** عايزينها، بعد ما نوزّع خصم الأوردر عليها.
 *
 * خصم الأوردر عندنا مبلغ واحد على الأوردر كله، وشوبيفاي بتحط الخصم على
 * البند — فبنوزّعه بالنسبة والتناسب.
 */
export function desiredLines(
  items: OurItem[],
  orderDiscount: number
): Map<string, { qty: number; price: number }> {
  const desired = new Map<string, { qty: number; price: number }>();

  for (const it of items) {
    const svid = it.shopifyVariantId;
    if (!svid || NOT_SHOPIFY_PREFIXES.some((p) => String(svid).startsWith(p))) {
      continue;
    }
    const key = String(svid);
    const cur = desired.get(key);
    // نفس المنتج مرتين في الأوردر: الكمية بتتجمع، والسعر بياخد الأول
    if (cur) cur.qty += Number(it.quantity);
    else desired.set(key, { qty: Number(it.quantity), price: Number(it.salePrice) });
  }

  const discount = Math.max(0, Number(orderDiscount ?? 0));
  if (discount > 0) {
    let total = 0;
    for (const [, d] of desired) total += d.price * d.qty;
    if (total > 0) {
      const factor = Math.max(0, 1 - discount / total);
      for (const [, d] of desired) {
        d.price = Math.round(d.price * factor * 100) / 100;
      }
    }
  }

  return desired;
}

/** القرار نفسه */
export function planOrderPush(
  items: OurItem[],
  shopLines: ShopLine[],
  orderDiscount: number
): PushPlan {
  const desired = desiredLines(items, orderDiscount);

  const shopByVar = new Map<string, ShopLine>();
  for (const line of shopLines) shopByVar.set(line.shopifyVariantId, line);

  const plan: PushPlan = {
    onlyQty: [],
    priceFix: [],
    toAdd: [],
    toRemove: [],
    cantRaise: [],
  };

  for (const [svid, d] of desired) {
    const s = shopByVar.get(svid);
    if (!s) {
      plan.toAdd.push({ svid, qty: d.qty, price: d.price });
      continue;
    }
    if (s.quantity !== d.qty) plan.onlyQty.push({ svid, qty: d.qty });

    // فرق أقل من قرش مش فرق
    if (Math.abs(d.price - s.effectivePrice) >= 0.01) {
      if (d.price > s.basePrice + 0.009) {
        plan.cantRaise.push({ svid, system: d.price, base: s.basePrice });
      } else {
        plan.priceFix.push({ svid, target: d.price, base: s.basePrice });
      }
    }
  }

  for (const [svid] of shopByVar) {
    if (!desired.has(svid)) plan.toRemove.push(svid);
  }

  return plan;
}

export type RawLineNode = {
  id?: string;
  quantity?: number | string | null;
  currentQuantity?: number | string | null;
  variant?: { legacyResourceId?: string | null } | null;
  originalUnitPriceSet?: { shopMoney?: { amount?: string | null } | null } | null;
  discountedUnitPriceSet?: { shopMoney?: { amount?: string | null } | null } | null;
};

/**
 * بنود شوبيفاي بالشكل اللي بنقارن بيه.
 *
 * **`legacy` بيرجّع سلوك الدالة القديمة بالحرف** عشان المقارنة تبقى على نفس
 * الأرضية: بتقرا `quantity` (الكمية **الأصلية** وقت الأوردر) وبتكتب فوق
 * البند لو المنتج متكرر.
 *
 * والوضع العادي بيقرا `currentQuantity` (الكمية الحالية بعد أي تعديل سابق)
 * وبيجمع البنود المتكررة — وده الصح.
 */
export function readShopLines(
  nodes: RawLineNode[],
  opts: { legacy?: boolean } = {}
): ShopLine[] {
  const legacy = opts.legacy === true;
  const byVar = new Map<string, ShopLine>();

  for (const node of nodes ?? []) {
    const svid = node.variant?.legacyResourceId;
    if (!svid) continue;

    const qty = Number(legacy ? node.quantity : node.currentQuantity);
    if (!(qty > 0)) continue;

    const key = String(svid);
    const base = Number(node.originalUnitPriceSet?.shopMoney?.amount ?? 0);
    const eff = Number(node.discountedUnitPriceSet?.shopMoney?.amount ?? 0);
    const existing = byVar.get(key);

    if (!existing || legacy) {
      // القديمة بتكتب فوق البند الأول — بند مكرر معناه إن الأول بيختفي
      byVar.set(key, {
        shopifyVariantId: key,
        quantity: qty,
        basePrice: base,
        effectivePrice: eff,
      });
    } else {
      // الصح: الكميات بتتجمع، والسعر من أول بند
      existing.quantity += qty;
    }
  }

  return [...byVar.values()];
}

/** المنتجات اللي ليها أكتر من بند في نفس الأوردر */
export function duplicatedVariants(nodes: RawLineNode[]): string[] {
  const counts = new Map<string, number>();
  for (const node of nodes ?? []) {
    const svid = node.variant?.legacyResourceId;
    if (!svid || !(Number(node.currentQuantity) > 0)) continue;
    const key = String(svid);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([svid]) => svid);
}

/** الخصم بالنسبة اللي يوصّل من سعر الكتالوج للسعر اللي عايزينه */
export function discountPercent(base: number, target: number): number {
  return Math.round(((base - target) / base) * 1000000) / 10000;
}
