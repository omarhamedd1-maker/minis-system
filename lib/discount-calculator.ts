// ==========================================================================
// حاسبة الخصم الآمن — تقدر تنزل لحد كام قبل ما تخسر
// --------------------------------------------------------------------------
// «خصم ٢٠٪» جملة سهلة، والحساب وراها مش سهل: الخصم بيتشال من **السعر**،
// والربح بيتحسب على **الأوردر كله** بعد التكلفة والشحن ورسوم بوسطة، وفوق ده
// كله فيه نسبة من الأوردرات **بترجع** — واللي بيرجع بيدفع شحن ومارجعش بفلوس.
//
// ⚠️⚠️ **نصيب المرتجعات هو اللي محدش بيحسبه.** لو ١٨٪ من شحناتك بترجع، يبقى
// كل ١٠٠ أوردر بتشحنهم فيهم ١٨ خسارة صافية — وتكلفتهم بتتوزّع على الـ٨٢
// اللي وصلوا. الأوردر اللي بيبان رابح ٢٠٠ جنيه بيبقى رابح أقل من كده بكتير.
//
// **الملف ده صافي** — أرقام داخلة وأرقام خارجة.
// ==========================================================================

export type PriceInput = {
  /** سعر البيع قبل أي خصم */
  price: number;
  /** تكلفة القطعة */
  cost: number;
  /** اللي العميل بيدفعه شحن */
  shippingCharged: number;
  /** اللي شركة الشحن بتاخده منك على الشحنة */
  shippingCost: number;
  /**
   * نسبة الرجوع (٠ إلى ١).
   *
   * ⚠️ **دي بتيجي من داتاك الحقيقية مش من تخمين** — نسبة الرجوع عند مينيز
   * ١٨٪ وقت كتابة الملف ده.
   */
  returnRate: number;
};

export type PriceResult = {
  /** ربح الأوردر الواحد لو وصل */
  profitIfDelivered: number;
  /** خسارة الأوردر اللي رجع (شحن راح وجه في الغالب) */
  lossIfReturned: number;
  /** الربح المتوقع بعد ما ندخل نسبة الرجوع في الحساب */
  expected: number;
};

/** الربح المتوقع لسعر معيّن */
export function priceOutcome(input: PriceInput, discount = 0): PriceResult {
  const price = Math.max(0, Number(input.price) || 0);
  const cost = Math.max(0, Number(input.cost) || 0);
  const charged = Math.max(0, Number(input.shippingCharged) || 0);
  const shipCost = Math.max(0, Number(input.shippingCost) || 0);
  const rate = Math.min(1, Math.max(0, Number(input.returnRate) || 0));

  const after = Math.max(0, price - Math.max(0, discount));

  // وصل: سعر بعد الخصم + شحن محصّل − تكلفة − شحن مدفوع
  const profitIfDelivered = after + charged - cost - shipCost;

  // ⚠️ **رجع: بتدفع الشحن ومابتحصّلش حاجة.** البضاعة نفسها بترجع فمش
  // خسارة — بس لو رجعت تالفة يبقى الرقم ده متفائل.
  const lossIfReturned = shipCost;

  const expected = (1 - rate) * profitIfDelivered - rate * lossIfReturned;

  return {
    profitIfDelivered: round(profitIfDelivered),
    lossIfReturned: round(lossIfReturned),
    expected: round(expected),
  };
}

/**
 * أكبر خصم قبل ما الربح المتوقع يوصل صفر.
 *
 * ⚠️ **بيرجّع صفر لو السعر أصلًا بيخسر** — «تقدر تخصم ٠» أوضح من رقم سالب.
 */
export function safeDiscount(input: PriceInput): number {
  const zero = priceOutcome(input, 0);
  if (zero.expected <= 0) return 0;

  const rate = Math.min(1, Math.max(0, Number(input.returnRate) || 0));
  // الربح المتوقع بينزل بـ(١ − نسبة الرجوع) لكل جنيه خصم
  const perPound = 1 - rate;
  if (perPound <= 0) return 0;

  const max = zero.expected / perPound;
  return Math.max(0, Math.floor(Math.min(max, Number(input.price) || 0)));
}

/** نفس الحسبة بس بنسبة مئوية من السعر */
export function safeDiscountPercent(input: PriceInput): number {
  const price = Number(input.price) || 0;
  if (price <= 0) return 0;
  return Math.floor((safeDiscount(input) / price) * 100);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
