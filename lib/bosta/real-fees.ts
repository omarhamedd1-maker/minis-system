// ==========================================================================
// رسوم بوسطة **الحقيقية** — مش تقدير
// --------------------------------------------------------------------------
// السيستم كله كان بيقدّر رسوم الشحنة بمعادلة (`lib/shipping-cost.ts`).
// المعادلة دي اتفكّت من أوردرات حقيقية وشغالة، بس فضلت تقدير — وفيها حتة
// كبيرة مبنية على افتراض إن الشحن نفسه ٨٨ جنيه ثابتة (الباقة).
//
// **وبوسطة بتقول الرقم الحقيقي.** جوّه `wallet.cashCycle` في تفاصيل الشحنة
// فيه كشف حساب مفصّل باللي اتخصم منك فعلاً. مثال أوردر ١٠٧٤:
//
//   shipping_fees .... 113.00     ← الشحن الحقيقي، مش ٨٨
//   insurance_fees ..... 6.00     ← وإحنا كنا مقدرينه ٢٠
//   cod_fees ........... 0.00
//   collection_fees .... 0.00
//   vat ............... 16.66
//   bosta_fees ....... 135.66     ← الإجمالي اللي اتخصم
//
// وتقديرنا كان ٣٧٫٦٢. الفرق ده مش تفصيلة — ده بيغيّر ربح كل أوردر.
//
// **الرقم ده مابييجيش في المزامنة العادية** (مسار البحث بيرجّع `pricing`
// فاضي ومفيش `wallet`)، بييجي بس لما نجيب الشحنة لوحدها. وهو **مابيتغيّرش
// بعد ما الشحنة تخلص ودورة الكاش تتقفل** — فبنجيبه مرة واحدة ونخزّنه.
//
// دوال صافية بالكامل هنا: بتاخد اللي بوسطة ردّت بيه وبترجّع أرقام.
// ==========================================================================

/** كشف حساب الشحنة زي ما بوسطة بتكتبه — كله نصوص عندهم */
export type BostaCashCycle = {
  bosta_fees?: string | number | null;
  shipping_fees?: string | number | null;
  insurance_fees?: string | number | null;
  cod_fees?: string | number | null;
  collection_fees?: string | number | null;
  opening_package_fees?: string | number | null;
  vat?: string | number | null;
  rto_discount?: string | number | null;
  bundle_discount?: string | number | null;
};

export type BostaWallet = {
  cashCycle?: BostaCashCycle | null;
} | null;

export type RealFees = {
  /** الإجمالي اللي بوسطة خدته — ده الرقم اللي يتحاسب عليه */
  total: number;
  /** الشحن لوحده — منه بنعرف الباقة بتغطي كام فعلاً */
  shipping: number;
  insurance: number;
  cod: number;
  collection: number;
  opening: number;
  vat: number;
};

/** بوسطة بتكتب الأرقام كنصوص ("135.66")، وساعات بترجّعها فاضية */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * بيطلّع الرسوم الحقيقية من رد بوسطة.
 *
 * بيرجّع `null` لو الكشف لسه مافيهوش رقم إجمالي — يعني الشحنة لسه ماخلصتش
 * دورة الكاش، والرقم هيتغيّر. **مانخزّنش رقم لسه بيتحرك**، أحسن ما نقفل
 * على رقم ناقص ونفتكره نهائي.
 */
export function realFees(wallet: BostaWallet): RealFees | null {
  const c = wallet?.cashCycle;
  if (!c) return null;

  const total = num(c.bosta_fees);
  if (total <= 0) return null;

  return {
    total: round2(total),
    shipping: round2(num(c.shipping_fees)),
    insurance: round2(num(c.insurance_fees)),
    cod: round2(num(c.cod_fees)),
    collection: round2(num(c.collection_fees)),
    opening: round2(num(c.opening_package_fees)),
    vat: round2(num(c.vat)),
  };
}

/**
 * تفصيلة بالعربي تتعرض في الأوردر.
 * بنسيب البنود اللي بصفر برّه — الكشف بيبقى فيه ١٥ بند أغلبهم أصفار.
 */
export function realFeesBreakdown(f: RealFees): { label: string; amount: number }[] {
  const rows: [string, number][] = [
    ["الشحن", f.shipping],
    ["التأمين", f.insurance],
    ["عمولة التحصيل", f.cod],
    ["رسم التحصيل", f.collection],
    ["فتح الشحنة", f.opening],
    ["ضريبة", f.vat],
  ];
  return rows.filter(([, v]) => v > 0).map(([label, amount]) => ({ label, amount }));
}

/**
 * الباقة غطّت شحن الشحنة دي ولا لأ؟
 *
 * بوسطة بتكتب `bundle_discount` بنفس قيمة `shipping_fees` لما الشحنة تتحسب
 * من الباقة، فالإجمالي بينزل تحت رقم الشحن. مثال حقيقي:
 *
 *   أوردر ١٣٢٠: شحن ٨٨ − خصم باقة ٨٨ + تأمين ١٢٫٩٨ + فتح ٧ + ضريبة = ٢٢٫٧٨
 *   أوردر ١٠٧٤: شحن ١١٣ + تأمين ٦ + ضريبة ١٦٫٦٦ = ١٣٥٫٦٦ (مافيش خصم)
 *
 * فبنستنتجها من الرقمين المخزّنين من غير ما نخزّن عمود تالت: **الإجمالي أقل
 * من الشحن معناه إن حاجة غطّته**.
 */
export function bundleCovered(
  total: number | null | undefined,
  shipping: number | null | undefined
): boolean {
  const t = Number(total ?? 0);
  const s = Number(shipping ?? 0);
  return s > 0 && t > 0 && t < s;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
