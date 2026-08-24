// ==========================================================================
// مؤشرات التشغيل — الأرقام اللي بتقول «إيه اللي بيضيع»
// --------------------------------------------------------------------------
// الداشبورد بتقول المبيعات والأرباح، وده بيجاوب «كسبت كام». المؤشرات هنا
// بتجاوب السؤال التاني اللي صاحب المتجر بيسأله كل أسبوع: **فين التسريب؟**
//
// كلها **دوال صافية** — بتاخد أوردرات وبترجّع أرقام، من غير قاعدة بيانات
// ولا شاشة. عشان تتختبر بالظبط وتتعرض في أي مكان بعدين.
//
// ⚠️ **قاعدة واحدة حاكمة**: الأوردر اللي بوسطة ماشالتوش (`bosta_tracking`
// فاضي) **مايدخلش في أي نسبة شحن**. عندنا ٣٥ أوردر مسلّمين ماعدّوش على
// بوسطة أصلًا، ولو اتحسبوا بيلخبطوا كل النِّسَب — ودي غلطة وقعنا فيها
// فعلًا في `collection-aging` قبل ما تتصلّح.
// ==========================================================================

export type OpsOrder = {
  order_status: string | null;
  order_date: string | null;
  delivered_at: string | null;
  bosta_tracking?: string | null;
  bosta_created_at?: string | null;
  bosta_cod: number | null;
  discount: number;
  shipping_price?: number | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

/** الأوردر عدّى على بوسطة فعلاً؟ */
export function wentThroughCarrier(o: OpsOrder): boolean {
  return Boolean(o.bosta_tracking);
}

function total(o: OpsOrder): number {
  const goods = o.order_items.reduce(
    (s, i) => s + i.quantity * i.sale_price_at_order,
    0
  );
  return goods - (o.discount ?? 0) + Number(o.shipping_price ?? 0);
}

export type CarrierRates = {
  /** اتشحن فعلاً (عليه رقم تتبع) */
  shipped: number;
  delivered: number;
  /** رجع لنا من غير ما يتسلّم */
  returned: number;
  /** اتسلّم وبعدين رجّعه العميل */
  returnedAfter: number;
  /** نسبة التسليم من اللي اتشحن */
  deliveryRate: number;
  /** نسبة الرجوع من اللي اتشحن — ده المؤشر اللي بيوجع */
  rtoRate: number;
  /** فلوس البضاعة اللي رجعت */
  returnedValue: number;
};

/**
 * نِسَب الشحن.
 *
 * **المقام هو اللي اتشحن، مش كل الأوردرات.** لو حسبناها على الكل، الأوردر
 * الجديد اللي لسه ماخرجش بيقلّل نسبة التسليم من غير ذنب — والنسبة بتبقى
 * بتقيس سرعة شغلنا مش أداء الشحن.
 */
export function carrierRates(orders: OpsOrder[]): CarrierRates {
  const shippedOrders = orders.filter(wentThroughCarrier);
  const shipped = shippedOrders.length;

  let delivered = 0;
  let returned = 0;
  let returnedAfter = 0;
  let returnedValue = 0;

  for (const o of shippedOrders) {
    if (o.order_status === "delivered") delivered++;
    else if (o.order_status === "returned") {
      returned++;
      returnedValue += total(o);
    }
    if (o.order_status === "returned_after_delivery") {
      returnedAfter++;
      returnedValue += total(o);
    }
  }

  const pct = (n: number) => (shipped > 0 ? Math.round((n / shipped) * 100) : 0);

  return {
    shipped,
    delivered,
    returned,
    returnedAfter,
    deliveryRate: pct(delivered),
    rtoRate: pct(returned + returnedAfter),
    returnedValue: Math.round(returnedValue * 100) / 100,
  };
}

/** فرق الأيام بالتقويم */
function days(from: string, to: string): number {
  const a = Date.parse(from.slice(0, 10) + "T12:00:00Z");
  const b = Date.parse(to.slice(0, 10) + "T12:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export type LeadTime = {
  /** متوسط الأيام من الأوردر للتسليم */
  average: number | null;
  /** النص — أصدق من المتوسط لما يبقى فيه شحنة اتأخرت شهر */
  median: number | null;
  count: number;
  /** أبطأ توصيل حصل */
  slowest: number | null;
  /** تسليمات تواريخها مش موثوقة فاتشالت من الحساب */
  skipped: number;
};

/**
 * زمن التوصيل.
 *
 * **بنرجّع الوسيط جنب المتوسط بقصد.** شحنة واحدة قعدت ٦٠ يوم بتطلّع
 * المتوسط لفوق وتخلّيه يكدب على الواقع، والوسيط بيفضل بيقول التجربة
 * الحقيقية لأغلب العملاء.
 *
 * ⚠️ **والتسليم في نفس يوم إنشاء الشحنة بيتشال من الحساب.** ده مش توصيل
 * سريع — ده أوردر قديم اتنقل بالجملة واتحطّله نفس التاريخ في كل الخانات.
 * في مينيز **٢٠١ من ٢٣٨** كده، ولو اتحسبوا الوسيط بيطلع صفر يوم وده رقم
 * مستحيل. بنعدّهم في `skipped` عشان يبانوا مش يتخبّوا.
 */
export function leadTime(orders: OpsOrder[]): LeadTime {
  const spans: number[] = [];
  let skipped = 0;
  for (const o of orders) {
    if (o.order_status !== "delivered") continue;
    if (!o.order_date || !o.delivered_at) continue;
    const span = days(o.order_date, o.delivered_at);
    // الشحنة اتعملت واتسلّمت نفس اليوم؟ التواريخ دي منقولة مش حقيقية
    const sameDayAsShipment =
      o.bosta_created_at != null &&
      days(o.bosta_created_at, o.delivered_at) === 0;
    if (span === 0 || sameDayAsShipment) {
      skipped++;
      continue;
    }
    spans.push(span);
  }
  if (spans.length === 0) {
    return { average: null, median: null, count: 0, slowest: null, skipped };
  }
  spans.sort((a, b) => a - b);
  const sum = spans.reduce((s, n) => s + n, 0);
  const mid = Math.floor(spans.length / 2);
  const median =
    spans.length % 2 === 0 ? (spans[mid - 1] + spans[mid]) / 2 : spans[mid];

  return {
    average: Math.round((sum / spans.length) * 10) / 10,
    median: Math.round(median * 10) / 10,
    count: spans.length,
    slowest: spans[spans.length - 1],
    skipped,
  };
}
