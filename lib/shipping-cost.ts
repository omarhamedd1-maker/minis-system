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
  /** أقصى تأمين مهما كانت البضاعة غالية */
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

  // المرتجع ماتحصّلش منه حاجة، فمفيش عمولة تحصيل ولا رسم تحويل
  const codFee = returned
    ? 0
    : rules.codFeeRate * Math.max(0, cod - rules.codFeeThreshold);
  const transferFee = returned
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
