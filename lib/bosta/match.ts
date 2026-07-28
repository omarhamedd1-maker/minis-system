// ==========================================================================
// ربط شحنة بوسطة بأوردر عندنا
// --------------------------------------------------------------------------
// فيه حماية مهمة هنا: لو الشحنة اتربطت برقم الأوردر بس والاسم مختلف تمامًا،
// بنتجاهلها. ده بيمنع إن رقم أوردر متكرر أو مرجع غلط يخلي شحنة تتحط على
// أوردر عميل تاني — وده غلط بيوجع لأنه بيحرّك فلوس.
// ==========================================================================

import { deliveryOrderNumber, type BostaDelivery } from "./reconcile";

/** بيشيل التشكيل ويوحّد الألف والياء والتاء المربوطة عشان المقارنة تنفع */
export function normalizeName(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/**
 * هل الاسمين فيهم كلمة مشتركة؟
 * لو أي اسم فاضي بنعدّي (منمنعش الربط عشان بيانات ناقصة).
 */
export function namesShare(ourName: string, bostaName: string): boolean {
  const a = normalizeName(ourName);
  const b = normalizeName(bostaName).replace(/[\s.]+/g, "");
  if (!a.trim() || !b.trim()) return true;

  const tokens = a.match(/[ء-يa-z]{3,}/g) ?? [];
  if (tokens.length === 0) return true;
  return tokens.some((t) => b.includes(t));
}

export type MatchTarget = {
  id: string;
  order_number: string | number | null;
  bosta_tracking: string | null;
  customerName: string | null;
};

export type MatchResult<T> =
  | { kind: "tracking"; order: T }
  | { kind: "order_number"; order: T }
  | { kind: "name_mismatch"; order: T }
  | { kind: "none" };

/** بيبني فهرس مرة واحدة بدل ما ندوّر على كل أوردر لكل شحنة */
export function buildIndex<T extends MatchTarget>(orders: T[]) {
  const byNumber = new Map<string, T>();
  const byTracking = new Map<string, T>();
  for (const o of orders) {
    byNumber.set(String(o.order_number), o);
    if (o.bosta_tracking) byTracking.set(String(o.bosta_tracking), o);
  }
  return { byNumber, byTracking };
}

export function matchDelivery<T extends MatchTarget>(
  d: BostaDelivery & { receiver?: { fullName?: string | null } | null },
  index: ReturnType<typeof buildIndex<T>>
): MatchResult<T> {
  const tracking = d.trackingNumber ? String(d.trackingNumber) : "";

  // رقم التتبع أقوى دليل — لو مربوط قبل كده يبقى هو هو
  if (tracking) {
    const hit = index.byTracking.get(tracking);
    if (hit) return { kind: "tracking", order: hit };
  }

  const order = index.byNumber.get(deliveryOrderNumber(d));
  if (!order) return { kind: "none" };

  // ربط برقم الأوردر بس — لازم الاسم يأكد
  if (!namesShare(order.customerName ?? "", d.receiver?.fullName ?? "")) {
    return { kind: "name_mismatch", order };
  }
  return { kind: "order_number", order };
}
