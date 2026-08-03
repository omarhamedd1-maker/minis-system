// ==========================================================================
// جدول أسعار بوسطة — نقطة البداية لكل بيزنس جديد
// --------------------------------------------------------------------------
// الأرقام دي منقولة من صفحة "خطط الأسعار" في حساب بوسطة (٣١ يوليو ٢٠٢٦)،
// **وهي مش ثابتة**: بوسطة بترقّي الخطة تلقائيًا مع عدد الأوردرات (الحساب
// الجديد على ٢٤ من ١٠٠). فالجدول ده قيمة ابتدائية بتتحفظ لكل بيزنس
// ويعدّلها من الإعدادات، مش رقم في الكود.
//
// كل الأرقام **قبل الضريبة**. التفاصيل في `docs/BOSTA-PRICING.md`.
// ==========================================================================

import {
  SHIPMENT_SERVICES,
  SHIPMENT_SIZES,
  type PriceTable,
  type PricingRules,
  type PricingZone,
  INSURANCE_PLANS,
} from "./pricing";

/**
 * صف واحد = حجم واحد، بالترتيب:
 * توصيل · تبديل · إرجاع · تحصيل نقدي · إرجاع لك
 */
type Row = [number, number, number, number, number];

/** ستة صفوف بترتيب `SHIPMENT_SIZES` */
type ZoneRows = [Row, Row, Row, Row, Row, Row];

const ZONE_PRICES: Record<PricingZone, ZoneRows> = {
  cairo_giza: [
    [81, 91, 102, 82, 71],
    [86, 96, 107, 87, 76],
    [91, 101, 112, 92, 81],
    [96, 106, 117, 97, 86],
    [181, 191, 202, 182, 171],
    [440, 450, 560, 540, 430],
  ],
  alex_beheira: [
    [86, 96, 102, 82, 76],
    [91, 101, 107, 87, 81],
    [96, 106, 112, 92, 86],
    [101, 111, 117, 97, 91],
    [186, 196, 202, 182, 176],
    [490, 500, 560, 540, 480],
  ],
  delta_canal: [
    [92, 102, 102, 82, 82],
    [97, 107, 107, 87, 87],
    [102, 112, 112, 92, 92],
    [107, 117, 117, 97, 97],
    [192, 202, 202, 182, 182],
    [550, 560, 560, 540, 540],
  ],
  north_saeed: [
    [104, 114, 102, 82, 94],
    [109, 119, 107, 87, 99],
    [114, 124, 112, 92, 104],
    [119, 129, 117, 97, 109],
    [204, 214, 202, 182, 194],
    [670, 680, 560, 540, 660],
  ],
  south_saeed: [
    [115, 125, 102, 82, 105],
    [120, 130, 107, 87, 110],
    [125, 135, 112, 92, 115],
    [130, 140, 117, 97, 120],
    [215, 225, 202, 182, 205],
    [780, 790, 560, 540, 770],
  ],
  // نفس أسعار جنوب الصعيد بالظبط
  north_coast: [
    [115, 125, 102, 82, 105],
    [120, 130, 107, 87, 110],
    [125, 135, 112, 92, 115],
    [130, 140, 117, 97, 120],
    [215, 225, 202, 182, 205],
    [780, 790, 560, 540, 770],
  ],
  sinai_wadi: [
    [127, 137, 102, 82, 117],
    [132, 142, 107, 87, 122],
    [137, 147, 112, 92, 127],
    [142, 152, 117, 97, 132],
    [227, 237, 202, 182, 217],
    [900, 910, 560, 540, 890],
  ],
};

/** بيفرد الصفوف لجدول كامل */
export function buildPriceTable(): PriceTable {
  const table: PriceTable = {};

  for (const [zone, rows] of Object.entries(ZONE_PRICES) as [
    PricingZone,
    ZoneRows,
  ][]) {
    const bySize: NonNullable<PriceTable[PricingZone]> = {};

    SHIPMENT_SIZES.forEach((size, sizeIndex) => {
      const byService: Record<string, number> = {};
      SHIPMENT_SERVICES.forEach((service, serviceIndex) => {
        byService[service] = rows[sizeIndex][serviceIndex];
      });
      bySize[size] = byService as NonNullable<
        NonNullable<PriceTable[PricingZone]>[(typeof SHIPMENT_SIZES)[number]]
      >;
    });

    table[zone] = bySize;
  }

  return table;
}

/**
 * إعدادات بوسطة الافتراضية.
 *
 * **التأمين افتراضيًا صفر** — الحساب الجديد على "لا يوجد تأمين"، والافتراض
 * الغلط بيزوّد تكلفة وهمية على كل شحنة.
 */
export function defaultBostaRules(): PricingRules {
  return {
    table: buildPriceTable(),
    transferRate: 0.01,
    codFeeRate: 0.01,
    codFeeThreshold: 3000,
    openFee: 7,
    insurance: INSURANCE_PLANS.none,
    vat: 1.14,
  };
}
