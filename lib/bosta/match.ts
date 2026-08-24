// ==========================================================================
// ربط شحنة بوسطة بأوردر عندنا
// --------------------------------------------------------------------------
// فيه حماية مهمة هنا: لو الشحنة اتربطت برقم الأوردر بس والاسم مختلف تمامًا،
// بنتجاهلها. ده بيمنع إن رقم أوردر متكرر أو مرجع غلط يخلي شحنة تتحط على
// أوردر عميل تاني — وده غلط بيحرّك فلوس.
//
// **ودور تالت اتزاد ٢٤ أغسطس: التليفون.** الشحنة اللي تتعمل من لوحة بوسطة
// من غير مرجع كانت ضايفة للأبد (٢ سِك: ٢٢٩ شحنة من ٣٩٩ كده)، والأوردر
// بيفضل على «تم التسليم» التخميني جاي من شوبيفاي. التليفون بيربط بس
// بشرطين: أوردر **واحد** غير مربوط بنفس التليفون، والاسم مؤكد — غير كده
// مافيش تخمين.
// ==========================================================================

import { deliveryOrderNumber, type BostaDelivery } from "./reconcile";

/**
 * آخر تسع أرقام بس — بوسطة بتكتب التليفون بأشكال مختلفة (+20، 0020، 01…).
 *
 * التسع أرقام بتشيل مفتاح الدولة والصفر البادئ مع بعض، فالأشكال كلها
 * بتطلع لنفس المفتاح. (نفس الدالة اللي بتربط شحنات مرتجع العميل من ٢٤
 * أغسطس — اتنقلت هنا عشان المطابقة العادية تستخدمها من غير دورة استيراد.)
 */
export function phoneKey(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

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
  /** تليفون العميل — لدور المطابقة بالتليفون لما المرجع ناقص */
  customerPhone?: string | null;
};

export type MatchResult<T> =
  | { kind: "tracking"; order: T }
  | { kind: "order_number"; order: T }
  | { kind: "name_mismatch"; order: T }
  | { kind: "phone"; order: T }
  | { kind: "none" };

/** بيبني فهرس مرة واحدة بدل ما ندوّر على كل أوردر لكل شحنة */
export function buildIndex<T extends MatchTarget>(orders: T[]) {
  const byNumber = new Map<string, T>();
  const byTracking = new Map<string, T>();
  /** **الأوردرات غير المربوطة بس** — المربوط ليه شحنته خلاص */
  const byPhone = new Map<string, T[]>();
  for (const o of orders) {
    byNumber.set(String(o.order_number), o);
    if (o.bosta_tracking) byTracking.set(String(o.bosta_tracking), o);
    else {
      const key = phoneKey(o.customerPhone);
      if (key) {
        const list = byPhone.get(key);
        if (list) list.push(o);
        else byPhone.set(key, [o]);
      }
    }
  }
  return { byNumber, byTracking, byPhone };
}

export function matchDelivery<T extends MatchTarget>(
  d: BostaDelivery & {
    receiver?: { fullName?: string | null; phone?: string | null } | null;
  },
  index: ReturnType<typeof buildIndex<T>>
): MatchResult<T> {
  const tracking = d.trackingNumber ? String(d.trackingNumber) : "";

  // رقم التتبع أقوى دليل — لو مربوط قبل كده يبقى هو هو
  if (tracking) {
    const hit = index.byTracking.get(tracking);
    if (hit) return { kind: "tracking", order: hit };
  }

  const order = index.byNumber.get(deliveryOrderNumber(d));

  // ربط برقم الأوردر بس — لازم الاسم يأكد
  if (order) {
    if (!namesShare(order.customerName ?? "", d.receiver?.fullName ?? "")) {
      return { kind: "name_mismatch", order };
    }
    return { kind: "order_number", order };
  }

  // **آخر دليل: التليفون.** الشحنة اللي اتعملت من لوحة بوسطة من غير مرجع
  // كانت ضايفة للأبد — والأوردر بيفضل على «تم التسليم» التخميني من شوبيفاي.
  // القاعدة هنا مشدة زي مرجع الأوردر: التليفون لازم يطابق **أوردر واحد
  // غير مربوط بس**، والاسم لازم يأكد. اتنين على نفس التليفون أو اسم
  // مختلف تمامًا = مافيش تخمين — بيتسيبوا للمراجعة.
  const key = phoneKey(d.receiver?.phone);
  if (key) {
    const confirmed = (index.byPhone.get(key) ?? []).filter((o) =>
      namesShare(o.customerName ?? "", d.receiver?.fullName ?? "")
    );
    if (confirmed.length === 1) return { kind: "phone", order: confirmed[0] };
  }

  return { kind: "none" };
}
