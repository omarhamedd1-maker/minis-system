// ==========================================================================
// سعر شحنة بوسطة — المعادلة الحقيقية
// --------------------------------------------------------------------------
// **المرجع: `docs/BOSTA-PRICING.md`** — اتفكّت من حاسبة بوسطة نفسها مش
// بالتخمين، واتأكدنا منها برقمين مطابقين بالقرش.
//
// اللي كان في `shipping-cost.ts` بيحسب **الرسوم الإضافية بس**، وسعر الشحن
// الأساسي متحوّط إن الباقة بتغطيه (٨٨). ده صح للبيزنس اللي على باقة، وغلط
// تمامًا للبيزنس اللي على النظام العادي — بيدفع ٨١ لـ٩٠٠ حسب الوجهة والحجم.
//
// المعادلة:
//
//     الإجمالي = (سعر الشحن الأساسي + الرسوم الإضافية) × ١.١٤
//
// **والضريبة على المجموع كله** مش على سعر الشحن لوحده.
//
// الملف ده صافي — مافيش شبكة ولا قاعدة بيانات، فينفع يتختبر بالأرقام.
// ==========================================================================

/** مناطق التسعير السبعة — **الوجهة** مش مكان الاستلام */
export const PRICING_ZONES = [
  "cairo_giza",
  "alex_beheira",
  "delta_canal",
  "north_saeed",
  "south_saeed",
  "north_coast",
  "sinai_wadi",
] as const;
export type PricingZone = (typeof PRICING_ZONES)[number];

export const ZONE_LABELS: Record<PricingZone, string> = {
  cairo_giza: "القاهرة والجيزة",
  alex_beheira: "الاسكندرية والبحيرة",
  delta_canal: "الدلتا والقناة",
  north_saeed: "شمال الصعيد",
  south_saeed: "جنوب الصعيد",
  north_coast: "الساحل الشمالي",
  sinai_wadi: "سيناء والوادي الجديد",
};

/** أحجام الشحنة الستة */
export const SHIPMENT_SIZES = [
  "small",
  "large",
  "xl",
  "xxl",
  "big",
  "huge",
] as const;
export type ShipmentSize = (typeof SHIPMENT_SIZES)[number];

export const SIZE_LABELS: Record<ShipmentSize, string> = {
  small: "صغير ومتوسط",
  large: "كبير",
  xl: "أكبر",
  xxl: "كيس أبيض",
  big: "شحنة كبيرة",
  huge: "شحنة ضخمة (أثاث)",
};

export const SIZE_HINTS: Record<ShipmentSize, string> = {
  small: "٣٥ × ٤٠ سم",
  large: "٤٥ × ٥٠ سم",
  xl: "٥٥ × ٦٠ سم",
  xxl: "١٠٠ × ٥٠ سم",
  big: "أكبر من ١٠٠ × ٥٠",
  huge: "أثاث وسلع بيضاء",
};

/** الترتيب من الأصغر للأكبر — الأوردر بياخد أكبر حجم فيه */
const SIZE_ORDER: ShipmentSize[] = ["small", "large", "xl", "xxl", "big", "huge"];

/**
 * حجم الأوردر = **أكبر حجم في بنوده**.
 *
 * مش مجموع الأحجام: الشحنة الواحدة بتتسعّر بأكبر حاجة جواها، ومنتج صغير
 * جنب أثاث مابيغيّرش إن دي شحنة أثاث.
 *
 * والأوردر الفاضي بياخد أصغر حجم — أقل ضرر لو الحجم اتنسي.
 */
export function orderSize(itemSizes: (ShipmentSize | null | undefined)[]): ShipmentSize {
  let best = 0;
  for (const size of itemSizes) {
    const i = size ? SIZE_ORDER.indexOf(size) : -1;
    if (i > best) best = i;
  }
  return SIZE_ORDER[best];
}

/** أنواع الخدمة عند بوسطة */
export const SHIPMENT_SERVICES = [
  "delivery",
  "exchange",
  "return",
  "cash_collection",
  "return_to_you",
] as const;
export type ShipmentService = (typeof SHIPMENT_SERVICES)[number];

export const SERVICE_LABELS: Record<ShipmentService, string> = {
  delivery: "توصيل",
  exchange: "تبديل",
  return: "إرجاع",
  cash_collection: "تحصيل نقدي",
  return_to_you: "إرجاع لك",
};

/** جدول الأسعار: لكل منطقة، لكل حجم، لكل خدمة — قبل الضريبة */
export type PriceTable = Partial<
  Record<PricingZone, Partial<Record<ShipmentSize, Partial<Record<ShipmentService, number>>>>>
>;

/** باقات التأمين عند بوسطة — تلاتة مش واحدة */
export type InsurancePlan = {
  rate: number;
  min: number;
  max: number;
};

export const INSURANCE_PLANS: Record<string, InsurancePlan> = {
  none: { rate: 0, min: 0, max: 0 },
  aman: { rate: 0.005, min: 5, max: 20 },
  aman_plus: { rate: 0.01, min: 10, max: 50 },
};

export const INSURANCE_LABELS: Record<string, string> = {
  none: "لا يوجد تأمين",
  aman: "أمان — ٠.٥٪",
  aman_plus: "أمان جدًا — ١٪",
};

export type PricingRules = {
  /** جدول الأسعار الأساسية */
  table: PriceTable;
  /** نسبة رسم التحويل في اليوم التالي — صفر لو السحب أسبوعي */
  transferRate: number;
  /** نسبة رسم التحصيل فوق الحد */
  codFeeRate: number;
  /** الحد اللي فوقه بتتحسب — ٣٠٠٠ عند بوسطة دلوقتي */
  codFeeThreshold: number;
  /** رسم فتح الشحنة */
  openFee: number;
  /** باقة التأمين */
  insurance: InsurancePlan;
  /** معامل الضريبة — ١.١٤ يعني ١٤٪ */
  vat: number;
};

export type ShipmentPriceInput = {
  zone: PricingZone;
  size: ShipmentSize;
  service: ShipmentService;
  /** المبلغ اللي المندوب هيحصّله */
  cod: number;
  /** قيمة البضاعة — التأمين بيتحسب منها */
  productValue: number;
  allowToOpenPackage?: boolean;
  /** الشحنة رجعت من غير ما تتسلّم: مفيش تحصيل ولا تحويل */
  returned?: boolean;
};

export type ShipmentPriceBreakdown = {
  base: number;
  openFee: number;
  codFee: number;
  transferFee: number;
  insurance: number;
  beforeVat: number;
  vat: number;
  total: number;
  /** السعر الأساسي مش موجود في الجدول؟ الإجمالي ناقص وبنقولها */
  missingPrice: boolean;
};

/**
 * سعر الشحنة كامل، وكل بند لوحده عشان يتعرض للمستخدم.
 *
 * **لو السعر الأساسي مش في الجدول بنرجّع صفر ونعلّم `missingPrice`** بدل ما
 * نخمّن رقم. الرقم المخمّن بيدخل حسبة الأرباح ومحدش بياخد باله إنه مش حقيقي.
 */
export function shipmentPrice(
  input: ShipmentPriceInput,
  rules: PricingRules
): ShipmentPriceBreakdown {
  const cod = Math.max(0, Number(input.cod) || 0);
  const productValue = Math.max(0, Number(input.productValue) || 0);
  const returned = Boolean(input.returned);

  const base = rules.table[input.zone]?.[input.size]?.[input.service];
  const missingPrice = typeof base !== "number";
  const basePrice = missingPrice ? 0 : base;

  const openFee = input.allowToOpenPackage ? rules.openFee : 0;

  const insurance =
    rules.insurance.rate > 0
      ? Math.min(
          Math.max(rules.insurance.rate * productValue, rules.insurance.min),
          rules.insurance.max
        )
      : 0;

  // المرتجع ماتحصّلش منه حاجة — مفيش عمولة تحصيل ولا رسم تحويل
  const codFee = returned
    ? 0
    : rules.codFeeRate * Math.max(0, cod - rules.codFeeThreshold);

  // رسم التحويل على قيمة الأوردر **زائد الشحن**، و**بيتقرّب لجنيه صحيح**.
  // اتأكدنا من الاتنين برقمين حقيقيين:
  //   ١٠٠٠ + ٨١  → ١٪ = ١٠.٨١ → بوسطة كتبت ١١
  //   ١٠٠٠ + ١١٥ → ١٪ = ١١.١٥ → بوسطة كتبت ١١
  // ولو حسبناها من غير تقريب الضريبة بعدها بتطلع غلط بالقرش.
  const transferFee = returned
    ? 0
    : Math.round(rules.transferRate * (cod + basePrice));

  const beforeVat = basePrice + openFee + codFee + transferFee + insurance;
  const total = round2(beforeVat * rules.vat);

  return {
    base: round2(basePrice),
    openFee: round2(openFee),
    codFee: round2(codFee),
    transferFee: round2(transferFee),
    insurance: round2(insurance),
    beforeVat: round2(beforeVat),
    vat: round2(total - round2(beforeVat)),
    total,
    missingPrice,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
