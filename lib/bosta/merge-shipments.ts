// ==========================================================================
// الأوردر اللي ليه أكتر من شحنة في بوسطة
// --------------------------------------------------------------------------
// المشكلة: كل شحنة كانت بتكتب فوق اللي قبلها، فالأوردر بياخد بيانات آخر شحنة
// اتقرت — مش الأحدث بالضرورة. والأهم إن رسوم بوسطة كانت بتتحسب لشحنة واحدة
// بس، وبوسطة بتحاسب على كل شحنة. يعني التكلفة الحقيقية كانت أعلى من الظاهر.
//
// القاعدة:
//   الحالة ورقم التتبع  ← من أحدث شحنة (هي اللي بتوصف وضع الأوردر دلوقتي)
//   الرسوم والتحصيل     ← مجموع كل الشحنات (لأنك دفعتهم فعلاً)
//
// **إلا الشحنة الميتة**: المؤرشفة أو الملغية مش هتتحرك ومش هتحصّل مليم،
// فتحصيلها **صفر** ورسوم الفلوس بتاعتها (عمولة التحصيل ورسم التحويل) مالهاش
// معنى. أوردر ١٣٣٦ هو اللي كشفها: شحنة مؤرشفة بتحصيل ١١٬٩٧٨ وشحنة حية
// بتحصيل صفر — السيستم كان بيجمعهم ويقول التحصيل ١١٬٩٧٨ وهو صفر، ويحسب
// رسوم ٣١١٫٨٦ منهم ٢٨١ على شحنة ماتحركتش أصلاً.
// ==========================================================================

import type { BostaRawDelivery } from "./client";
import { shippingCost, type CarrierFeeRules } from "../shipping-cost";
import { isDeadShipment, mapBostaState } from "./order-status";

/** بيرتّب الشحنات من الأقدم للأحدث. اللي مالهاش تاريخ بتتحط الأول */
export function sortByCreated(deliveries: BostaRawDelivery[]): BostaRawDelivery[] {
  return [...deliveries].sort((a, b) => {
    const ta = Date.parse(String(a.createdAt ?? "")) || 0;
    const tb = Date.parse(String(b.createdAt ?? "")) || 0;
    return ta - tb;
  });
}

export type MergedShipments = {
  /** أحدث شحنة — منها بناخد الحالة ورقم التتبع */
  latest: BostaRawDelivery;
  /** مجموع اللي المندوب حصّله من كل الشحنات */
  totalCod: number;
  /** مجموع رسوم بوسطة على كل الشحنات */
  totalFee: number;
  /** عدد الشحنات المربوطة بالأوردر ده */
  count: number;
};

/**
 * بيدمج شحنات أوردر واحد في صورة واحدة.
 * بيفترض إن الليستة كلها لنفس الأوردر.
 */
export function mergeShipments(
  deliveries: BostaRawDelivery[],
  productValue: number,
  orderStatus: string | null,
  rules?: CarrierFeeRules
): MergedShipments | null {
  if (deliveries.length === 0) return null;

  const sorted = sortByCreated(deliveries);
  const latest = sorted[sorted.length - 1];

  let totalCod = 0;
  let totalFee = 0;

  for (const d of sorted) {
    // الشحنة الميتة مش هتحصّل حاجة — تحصيلها صفر مهما كان مكتوب عليها
    const dead = isDeadShipment(d.state?.value, d.state?.code);
    const cod = dead ? 0 : Number(d.cod ?? 0);
    totalCod += cod;

    // كل شحنة ليها رسومها حسب حالتها هي — المرتجع رسومه أقل
    const mapped = mapBostaState(d.state?.value ?? null);
    const asReturned =
      mapped === "returned" && orderStatus !== "returned_after_delivery";

    totalFee += shippingCost(
      {
        cod,
        productValue,
        allowToOpenPackage: Boolean(d.allowToOpenPackage),
        // الميتة زي الراجعة: مفيش عمولة تحصيل ولا رسم تحويل. سايبين رسم
        // الفتح والتأمين عليها لأن بوسطة ساعات بتحاسب عليهم، والزيادة في
        // التكلفة أأمن من النقص فيها
        returned: asReturned || dead,
        collected: mapped === "delivered",
      },
      rules
    ).total;
  }

  return {
    latest,
    totalCod,
    totalFee: Math.round(totalFee * 100) / 100,
    count: sorted.length,
  };
}
