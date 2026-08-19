// ==========================================================================
// مين بيرجع كتير — المنتج والعميل
// --------------------------------------------------------------------------
// المرتجع بيدفع **شحن رايح وجاي ورسوم بوسطة**، والبضاعة بترجع بعد ما اتحركت
// مرتين. يعني كل مرتجع خسارة مباشرة، والفرق بين منتج بيرجع ٥٪ ومنتج بيرجع
// ٣٠٪ فلوس حقيقية كل شهر.
//
// ⚠️⚠️ **الحساب على الأوردر مش على البند — وده مقصود.**
//
// جدول البنود فيه خانة «كمية راجعة»، بس هي **صفر في كل الداتا** (اتفحصت
// ١٩ أغسطس ٢٠٢٦: صفر أوردر فيها كمية راجعة، مقابل ٤٩ أوردر حالتها راجع).
// السبب إن بوسطة بترجّع **الطرد كله**، مافيش نص مرتجع. فلو حسبنا بالخانة
// دي كل النسب هتطلع أصفار وتبان إن مفيش مشكلة أصلًا.
//
// **والمقام هو اللي اتشحن فعلًا** — مش كل الأوردرات. الأوردر الملغي أو
// اللي لسه جديد عمره ما ركب عربية، فحطّه في المقام بيخفّف النسبة كذب.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات.
// ==========================================================================

/** الحالات اللي معناها إن الطرد خرج فعلًا */
const WENT_OUT = ["delivered", "returned", "returned_after_delivery"];

/** الحالات اللي معناها إنه رجع */
const CAME_BACK = ["returned", "returned_after_delivery"];

export type RateOrder = {
  orderStatus: string | null | undefined;
  customerId?: string | null;
  customerName?: string | null;
  items?: { variantId?: string | null; productName?: string | null }[] | null;
};

export type RateRow = {
  key: string;
  name: string;
  /** اتشحن كام مرة */
  shipped: number;
  /** رجع كام مرة */
  returned: number;
  /** نسبة الرجوع ٪ */
  rate: number;
};

export type RateReport = {
  rows: RateRow[];
  /** نسبة الرجوع العامة — عشان المقارنة تبقى ليها معنى */
  overall: number;
  /** إجمالي اللي اتشحن */
  shipped: number;
};

/**
 * ⚠️ **الأقل من العدد ده بيتشال.**
 *
 * منتج اتشحن مرتين ورجع مرة = ٥٠٪ — والرقم ده مالوش أي معنى. الحد الأدنى
 * بيمنع إن الشاشة تفضحك على حاجة اتباعت مرتين.
 */
export const MIN_SHIPPED = 5;

function rate(returned: number, shipped: number): number {
  return shipped === 0 ? 0 : Math.round((returned / shipped) * 100);
}

/** نسبة الرجوع لكل منتج */
export function productReturnRates(
  orders: RateOrder[],
  minShipped: number = MIN_SHIPPED
): RateReport {
  const seen = new Map<string, { name: string; shipped: number; returned: number }>();
  let shippedTotal = 0;
  let returnedTotal = 0;

  for (const o of orders) {
    const st = String(o.orderStatus ?? "");
    if (!WENT_OUT.includes(st)) continue;
    shippedTotal++;
    const back = CAME_BACK.includes(st);
    if (back) returnedTotal++;

    // **المنتج بيتعدّ مرة واحدة في الأوردر** حتى لو ليه كذا بند — الرجوع
    // بيحصل للطرد كله، فعدّه مرتين بيضخّم نصيبه من غير سبب
    const once = new Set<string>();
    for (const it of o.items ?? []) {
      const key = String(it.variantId ?? it.productName ?? "").trim();
      if (!key || once.has(key)) continue;
      once.add(key);
      const row = seen.get(key) ?? {
        name: String(it.productName ?? "منتج").trim() || "منتج",
        shipped: 0,
        returned: 0,
      };
      row.shipped++;
      if (back) row.returned++;
      seen.set(key, row);
    }
  }

  const rows = [...seen.entries()]
    .filter(([, v]) => v.shipped >= minShipped)
    .map(([key, v]) => ({ key, name: v.name, shipped: v.shipped, returned: v.returned, rate: rate(v.returned, v.shipped) }))
    .sort((a, b) => b.rate - a.rate || b.returned - a.returned);

  return { rows, overall: rate(returnedTotal, shippedTotal), shipped: shippedTotal };
}

/**
 * نسبة الرجوع لكل عميل.
 *
 * **الحد الأدنى هنا أقل** — عميل رجّع ٣ من ٤ ده رقم بيقول حاجة، بخلاف
 * المنتج اللي محتاج عدد أكبر عشان النسبة تستقر.
 */
export function customerReturnRates(
  orders: RateOrder[],
  minShipped = 3
): RateReport {
  const seen = new Map<string, { name: string; shipped: number; returned: number }>();
  let shippedTotal = 0;
  let returnedTotal = 0;

  for (const o of orders) {
    const st = String(o.orderStatus ?? "");
    if (!WENT_OUT.includes(st)) continue;
    shippedTotal++;
    const back = CAME_BACK.includes(st);
    if (back) returnedTotal++;

    const key = String(o.customerId ?? "").trim();
    if (!key) continue;
    const row = seen.get(key) ?? {
      name: String(o.customerName ?? "بدون اسم").trim() || "بدون اسم",
      shipped: 0,
      returned: 0,
    };
    row.shipped++;
    if (back) row.returned++;
    seen.set(key, row);
  }

  const rows = [...seen.entries()]
    .filter(([, v]) => v.shipped >= minShipped && v.returned > 0)
    .map(([key, v]) => ({ key, name: v.name, shipped: v.shipped, returned: v.returned, rate: rate(v.returned, v.shipped) }))
    .sort((a, b) => b.rate - a.rate || b.returned - a.returned);

  return { rows, overall: rate(returnedTotal, shippedTotal), shipped: shippedTotal };
}
