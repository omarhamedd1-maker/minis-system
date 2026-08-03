// ==========================================================================
// حسبة رسوم شركة الشحن — المصدر الوحيد للحسبة دي في السيستم كله
// --------------------------------------------------------------------------
// الأرقام دي دلوقتي ثابتة لبوسطة. في مرحلة ٣ هتبقى إعدادات لكل بيزنس،
// وساعتها الدالة دي هتاخدها كمُدخل بدل ما تقراها من هنا — من غير ما يتغير
// أي حاجة في اللي بينادي عليها.
//
// المعادلة اتفكّت واتأكدنا منها على أوردرات حقيقية (شوف الاختبارات).
// ==========================================================================

export type CarrierFeeRules = {
  /** رسم فتح الشحنة للعميل قبل ما يستلم */
  openFee: number;
  /** نسبة عمولة التحصيل النقدي فوق الحد */
  codFeeRate: number;
  /** الحد اللي فوقه بتتحسب عمولة التحصيل */
  codFeeThreshold: number;
  /** نسبة رسم تحويل الفلوس لحسابك */
  transferRate: number;
  /** أقل رسم تحويل مهما كان المبلغ صغير */
  transferMin: number;
  /** نسبة التأمين من قيمة البضاعة */
  insuranceRate: number;
  /** أقل تأمين */
  insuranceMin: number;
  /**
   * أقصى تأمين مهما كانت البضاعة غالية.
   *
   * ⚠️ **السقف ده بيتطبّق على شحناتنا إحنا بس، وعشان سبب محدد**: الشحنة
   * اللي بنعملها بالـAPI مابنبعتش فيها **قيمة بضاعة** خالص، فبوسطة بتحط
   * تأمين افتراضي بسقف ٢٠ — وده اللي اتأكد على ٧١ شحنة حقيقية.
   *
   * لكن لو حد كتب قيمة البضاعة بإيده في تطبيق بوسطة (الخانة إجبارية هناك)،
   * التأمين بيبقى **١٪ من غير أي سقف**: قيمة ٥٠٠٠ = تأمين ٥٠ بالظبط،
   * متصوّرة من شاشتهم في ٣ أغسطس ٢٠٢٦.
   *
   * يعني لو قررنا يوم نبعت قيمة البضاعة مع الشحنة، السقف ده لازم يتشال
   * والتأمين يبقى نسبة — وده قرار فلوس (تغطية أعلى مقابل رسوم أعلى).
   */
  insuranceMax: number;
  /** معامل الضريبة (١.١٤ = ١٤٪) */
  vat: number;
};

/** أرقام بوسطة الحالية — اتأكدنا منها على أوردرات حقيقية في ٢٨ يوليو ٢٠٢٦ */
export const BOSTA_FEES: CarrierFeeRules = {
  openFee: 7,
  codFeeRate: 0.01,
  codFeeThreshold: 2000,
  transferRate: 0.01,
  transferMin: 13,
  insuranceRate: 0.01,
  insuranceMin: 10,
  insuranceMax: 20,
  vat: 1.14,
};

export type ShippingCostInput = {
  /** المبلغ اللي المندوب هيحصّله من العميل */
  cod: number;
  /** قيمة البضاعة (إجمالي بنود الأوردر) */
  productValue: number;
  /** هل العميل مسموح له يفتح الشحنة قبل ما يستلم */
  allowToOpenPackage: boolean;
  /**
   * الشحنة رجعت من غير ما تتسلّم.
   * ساعتها مفيش تحصيل ومفيش تحويل — رسم الفتح والتأمين بس.
   */
  returned?: boolean;
};

export type ShippingCostBreakdown = {
  openFee: number;
  codFee: number;
  transferFee: number;
  insurance: number;
  beforeVat: number;
  vat: number;
  total: number;
};

/** بيرجّع تفصيل رسوم الشحنة الواحدة، وكل بند فيها لوحده عشان نعرضه للمستخدم */
export function shippingCost(
  input: ShippingCostInput,
  rules: CarrierFeeRules = BOSTA_FEES
): ShippingCostBreakdown {
  const cod = Math.max(0, Number(input.cod) || 0);
  const productValue = Math.max(0, Number(input.productValue) || 0);
  const returned = Boolean(input.returned);

  const openFee = input.allowToOpenPackage ? rules.openFee : 0;

  // التأمين بنسبة من قيمة البضاعة، بحد أدنى وحد أقصى
  const insurance = Math.min(
    Math.max(rules.insuranceRate * productValue, rules.insuranceMin),
    rules.insuranceMax
  );

  // المرتجع ماتحصّلش منه حاجة، فمفيش عمولة تحصيل ولا رسم تحويل.
  //
  // **والتحصيل صفر زي المرتجع بالظبط.** الحد الأدنى للتحويل (١٣) بيتطبّق
  // على الفلوس اللي بتتحوّل فعلاً، مش على شحنة مافيهاش فلوس أصلاً. اتأكدنا
  // من شاشة بوسطة نفسها: شحنة بتحصيل صفر وقيمة بضاعة ٥٠٠٠ رسومها ٦٤٫٩٨،
  // و٦٤٫٩٨ ÷ ١٫١٤ = ٥٧ بالظبط = ٥٠ تأمين + ٧ رسم فتح. مفيش تحويل.
  const noMoney = returned || cod === 0;
  const codFee = noMoney
    ? 0
    : rules.codFeeRate * Math.max(0, cod - rules.codFeeThreshold);
  const transferFee = noMoney
    ? 0
    : Math.max(rules.transferRate * cod, rules.transferMin);

  const beforeVat = openFee + codFee + transferFee + insurance;
  const total = round2(beforeVat * rules.vat);

  return {
    openFee: round2(openFee),
    codFee: round2(codFee),
    transferFee: round2(transferFee),
    insurance: round2(insurance),
    beforeVat: round2(beforeVat),
    vat: round2(total - beforeVat),
    total,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
