// ==========================================================================
// شحنة المرتجع اللي بترجع من العميل بعد ما استلم
// --------------------------------------------------------------------------
// دي بتتعمل من السيستم **أو من تطبيق بوسطة على طول**، والتانية مالهاش أي
// رابط بأوردرنا: `businessReference` بيبقى فاضي. فبنربطها بتليفون العميل.
//
// **ومابنخمّنش.** لو العميل عنده أكتر من أوردر متسلّم، مانعرفش المرتجع بتاع
// أنهي واحد — فبنسيبها للمراجعة بدل ما نحرّك بضاعة وفلوس على أوردر غلط.
// ==========================================================================

import { normalizeName, phoneKey } from "./match";
import { isDeadShipment } from "./order-status";

// بتعيش هنا عشان الاختبارات القديمة اللي بتجيبها من الملف ده
export { phoneKey };

/** أنواع الشحنات عند بوسطة — اتأكدنا منها من شحنات حقيقية */
export const DELIVERY_TYPES = {
  send: 10,
  returnToOrigin: 20, // ماوصلتش للعميل ورجعت لنا
  customerReturn: 25, // العميل استلم وبعدين رجّعها
  exchange: 30,
} as const;

export type ReturnCandidate = {
  id: string;
  order_number: string | number | null;
  order_status: string | null;
  customerPhone: string | null;
  customerName: string | null;
  return_tracking: string | null;
};

export type ReturnDelivery = {
  trackingNumber?: string | null;
  type?: { code?: number | null } | null;
  state?: { value?: string | null; code?: number | null } | null;
  receiver?: { phone?: string | null; fullName?: string | null } | null;
};

export type ReturnMatch =
  | { kind: "matched"; order: ReturnCandidate; arrived: boolean }
  /** لقينا أكتر من أوردر ينفع — محتاجة عين بشرية */
  | { kind: "ambiguous"; orders: ReturnCandidate[] }
  | { kind: "none" };

/** هل شحنة المرتجع وصلت لنا فعلًا؟ ٤٥/٤٦ = خلصت */
export function returnArrived(d: ReturnDelivery): boolean {
  const code = d.state?.code;
  if (code === 45 || code === 46) return true;
  const s = String(d.state?.value ?? "").toLowerCase();
  return s.includes("deliver") && !s.includes("out for");
}

export function isCustomerReturn(d: ReturnDelivery): boolean {
  return d.type?.code === DELIVERY_TYPES.customerReturn;
}

/** شحنة تبديل — بوسطة بتوصّل الجديد وتاخد القديم في نفس الرحلة */
export function isExchange(d: ReturnDelivery): boolean {
  return d.type?.code === DELIVERY_TYPES.exchange;
}

/**
 * شحنة المرتجع دي اتلغت أو بوسطة وقفتها (٤٨ · ١٠٤) — يعني **مش جاية**.
 * الأوردر مايفضلش مستنيها.
 */
export function returnDead(d: ReturnDelivery): boolean {
  return isDeadShipment(d.state?.value, d.state?.code);
}

/**
 * الأوردر الواحد ممكن يبقى عليه أكتر من شحنة مرتجع — واحدة اتعملت واتلغت
 * وواحدة تانية اتعملت بدالها ووصلت. **الأولوية للي وصلت فعلًا، مش لأحدث
 * واحدة.**
 *
 * أوردر ١٠٨١ كان الدليل: شحنة ٢٠٥٣٥٤١١ وصلت المخزن (٤٦) وشحنة ٤٤٨٠٥٤٢٥
 * ملغية (٤٨) — والسيستم كان رابط الأوردر بالملغية، فقعد متجمّد على «في
 * الطريق ليك» وهو واصل من زمان.
 *
 * الترتيب: وصلت ← لسه في السكة ← ملغية.
 */
export function pickReturnShipment<T extends ReturnDelivery>(
  shipments: T[]
): T | null {
  let best: T | null = null;
  let bestRank = -1;
  for (const d of shipments) {
    const rank = returnArrived(d) ? 2 : returnDead(d) ? 0 : 1;
    if (rank > bestRank) {
      best = d;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * بيربط شحنة المرتجع بأوردرها.
 * الترتيب: رقم التتبع المسجّل عندنا أولاً (أقوى دليل)، وبعدين تليفون العميل.
 */
export function matchCustomerReturn(
  d: ReturnDelivery,
  orders: ReturnCandidate[]
): ReturnMatch {
  const tracking = d.trackingNumber ? String(d.trackingNumber) : "";

  // إحنا اللي عملنا الشحنة دي من السيستم؟ يبقى مربوطة خلاص
  if (tracking) {
    const linked = orders.find((o) => o.return_tracking === tracking);
    if (linked) {
      return { kind: "matched", order: linked, arrived: returnArrived(d) };
    }
  }

  const key = phoneKey(d.receiver?.phone);
  if (!key) return { kind: "none" };

  // المرتجع بعد التسليم مالوش معنى غير على أوردر اتسلّم فعلاً
  const byPhone = orders.filter(
    (o) =>
      phoneKey(o.customerPhone) === key &&
      (o.order_status === "delivered" ||
        o.order_status === "returning" ||
        o.order_status === "returned_after_delivery")
  );

  if (byPhone.length === 0) return { kind: "none" };
  if (byPhone.length === 1) {
    return { kind: "matched", order: byPhone[0], arrived: returnArrived(d) };
  }

  // أكتر من واحد؟ نجرّب الاسم يفصل بينهم
  const name = normalizeName(d.receiver?.fullName ?? "");
  if (name.trim()) {
    const tokens = name.match(/[ء-يa-z]{3,}/g) ?? [];
    const byName = byPhone.filter((o) => {
      const on = normalizeName(o.customerName ?? "").replace(/[\s.]+/g, "");
      return tokens.some((t) => on.includes(t));
    });
    if (byName.length === 1) {
      return { kind: "matched", order: byName[0], arrived: returnArrived(d) };
    }
  }

  return { kind: "ambiguous", orders: byPhone };
}
