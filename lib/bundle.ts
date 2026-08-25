// ==========================================================================
// الباقات والأطقم — منتجات كتير بسعر واحد
// --------------------------------------------------------------------------
// الباقة بتبيع أكتر: العميل بياخد ٣ حاجات بسعر أحسن، وإنت بتشحن شحنة واحدة
// بدل تلاتة. المشكلة إن الباقة **بتكسر الحسابات** لو اتسجّلت كمنتج واحد:
// المخزون مابينقصش من الأشكال، والربح بيتحسب على تكلفة وهمية.
//
// ⚠️⚠️ **السعر لازم يتوزّع على البنود.** لو الباقة ٩٠٠ والبنود مجموعها
// ١٢٠٠، البنود لازم تتسجّل بـ٩٠٠ موزّعة **بنسبة سعر كل واحد** — مش كل بند
// بسعره الأصلي وخصم منفصل. من غير كده:
//   • ربح كل منتج بيبان أعلى من الحقيقة
//   • ونسبة الرجوع بتتحسب على قيمة مش موجودة
//
// ⚠️ **والقروش لازم تتلم.** ٩٠٠ على ٣ بنود = ٣٠٠ لكل واحد، بس ١٠٠٠ على ٣
// = ٣٣٣٫٣٣ ثلاث مرات = ٩٩٩٫٩٩. الفرق بيروح **لأكبر بند** عشان المجموع
// يساوي سعر الباقة بالظبط — الجنيه الضايع كل يوم بيبقى مشكلة بعد شهر.
//
// **الملف ده صافي** — بياخد باقة وبيرجّع بنود.
// ==========================================================================

export type BundleItem = {
  variantId: string;
  /** اسم للعرض */
  name: string | null;
  quantity: number;
  /** سعر الشكل ده لوحده */
  unitPrice: number;
  /** تكلفته */
  unitCost: number;
};

export type Bundle = {
  name: string;
  /** سعر الباقة كلها */
  price: number;
  items: BundleItem[];
};

export type SplitLine = {
  variantId: string;
  name: string | null;
  quantity: number;
  /** السعر بعد التوزيع — للوحدة */
  salePrice: number;
  unitCost: number;
};

/** مجموع البنود بأسعارها الأصلية */
export function itemsValue(items: BundleItem[]): number {
  return items.reduce(
    (s, i) => s + Math.max(0, i.quantity) * Math.max(0, i.unitPrice),
    0
  );
}

/** تكلفة الباقة */
export function bundleCost(items: BundleItem[]): number {
  return items.reduce(
    (s, i) => s + Math.max(0, i.quantity) * Math.max(0, i.unitCost),
    0
  );
}

/** العميل بيوفّر كام */
export function savings(b: Bundle): number {
  return Math.max(0, Math.round((itemsValue(b.items) - b.price) * 100) / 100);
}

/**
 * ربح الباقة.
 *
 * ⚠️ **مش بيدخل فيه الشحن** — الشحن على الأوردر كله مش على الباقة، وحطّه
 * هنا بيخلّي أوردر فيه باقتين يتحسب شحنه مرتين.
 */
export function bundleProfit(b: Bundle): number {
  return Math.round((b.price - bundleCost(b.items)) * 100) / 100;
}

/**
 * بيوزّع سعر الباقة على بنودها **بنسبة سعر كل بند**.
 *
 * ⚠️ **القروش الضايعة بتروح لأكبر بند** — عشان مجموع البنود يساوي سعر
 * الباقة بالظبط، مش ٩٩٩٫٩٩.
 *
 * ⚠️ **والبنود اللي سعرها كله صفر بتتوزّع بالتساوي** — القسمة على مجموع
 * صفر بترجّع `NaN`، والـ`NaN` بيتسجّل في الداتابيز ويبوّظ كل حسبة بعدها.
 */
export function splitBundlePrice(b: Bundle): SplitLine[] {
  const items = b.items.filter((i) => i.quantity > 0);
  if (items.length === 0) return [];

  const price = Math.max(0, Number(b.price) || 0);
  const base = itemsValue(items);

  // القيمة اللي كل بند بياخد منها نصيبه
  const weights = items.map((i) =>
    base > 0
      ? (Math.max(0, i.unitPrice) * i.quantity) / base
      : // ⚠️ كلهم بصفر؟ بالتساوي — مش قسمة على صفر
        1 / items.length
  );

  // بالقرش عشان التقريب مايضيّعش
  const cents = weights.map((w) => Math.round(price * w * 100));
  const target = Math.round(price * 100);
  const drift = target - cents.reduce((s, c) => s + c, 0);

  // ⚠️ الفرق كله لأكبر بند — توزيعه على الكل بيرجّع نفس المشكلة
  if (drift !== 0) {
    let biggest = 0;
    for (let i = 1; i < cents.length; i++) {
      if (cents[i] > cents[biggest]) biggest = i;
    }
    cents[biggest] += drift;
  }

  return items.map((i, n) => ({
    variantId: i.variantId,
    name: i.name,
    quantity: i.quantity,
    // السعر للوحدة — والكمية بتضربه تاني وقت التسجيل
    salePrice: Math.round((cents[n] / 100 / i.quantity) * 100) / 100,
    unitCost: Math.max(0, i.unitCost),
  }));
}

/**
 * الباقة سليمة؟
 *
 * ⚠️ **بيرجّع السبب بالعربي** — «الباقة غلط» من غير سبب بتخلّي اللي
 * بيستخدمها يجرّب لحد ما يزهق.
 */
export function checkBundle(b: Bundle): { ok: true } | { ok: false; reason: string } {
  if (!String(b.name ?? "").trim()) return { ok: false, reason: "الباقة محتاجة اسم" };

  const items = b.items.filter((i) => i.quantity > 0);
  if (items.length < 2) return { ok: false, reason: "الباقة محتاجة منتجين على الأقل" };

  if (!(b.price > 0)) return { ok: false, reason: "اكتب سعر الباقة" };

  // ⚠️ **الباقة أغلى من بنودها مش باقة** — العميل بيحسبها وبيكتشفها
  if (b.price > itemsValue(items)) {
    return { ok: false, reason: "سعر الباقة أغلى من مجموع المنتجات لوحدها" };
  }

  const cost = bundleCost(items);
  if (cost > 0 && b.price < cost) {
    return { ok: false, reason: "سعر الباقة أقل من تكلفتها — دي خسارة مؤكدة" };
  }

  return { ok: true };
}
