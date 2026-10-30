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
// بتلات شروط: أوردر **واحد** غير مربوط بنفس التليفون، والاسم مؤكد،
// **والشحنة مش أقدم من الأوردر بشهر** (اتزاد ٣٠ أكتوبر — اقرا
// `STALE_SHIPMENT_DAYS`). غير كده مافيش تخمين.
// ==========================================================================

import { deliveryOrderNumber, type BostaDelivery } from "./reconcile";
import { phoneKey } from "../phone";

// بتعيش هنا عشان كل اللي بيستوردوها من الملف ده مايتكسروش —
// الأصل في `lib/phone.ts` (توحيد ٢٤ أغسطس)
export { phoneKey };

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
  /**
   * تاريخ الأوردر عند شوبيفاي — **مش** `created_at` بتاعنا.
   *
   * ⚠️ الفرق ده مش تفصيلة: الأوردرات القديمة كلها اتسجّلت عندنا يوم
   * الاستيراد (مينيز ١٩ يوليو · ٢ سِك ١٧ و٢٤ أغسطس · مينو ١١ أغسطس)،
   * فـ`created_at` بتاعها بعد شحنتها بشهور. المقارنة بيه كانت هتقفل
   * المطابقة على ٥٦٨ أوردر تاريخي صح.
   */
  orderDate?: string | null;
};

/**
 * ⚠️⚠️ **الشحنة اللي أقدم من الأوردر بكتير مش شحنته.**
 *
 * دور التليفون (تحت) بيربط شحنة بلا مرجع بأوردر غير مربوط لنفس
 * الرقم. المشكلة إن الشحنة اللي مالهاش مرجع **بتفضل بلا أوردر للأبد**،
 * فأول ما نفس العميل يطلب تاني بعد شهور، الشحنة القديمة بتنطّ على
 * الأوردر الجديد — والأوردر بيتولد وهو «رجع ومتسلمش» أو «تم التسليم».
 *
 * حصل فعلًا في ٢ سِك: أوردر ١٥٧٧ (٢٩ أكتوبر) اتربط بشحنة من ١١ فبراير،
 * وأوردر ١٥٨٢ (٣٠ أكتوبر) اتربط بشحنة من ٢٥ فبراير واتقال عليه «تم
 * التسليم» بعد تلت دقايق من دخوله. والتحصيل كان بيفضح الربط: ٣٬٦٨٠
 * عندنا و٠ عند بوسطة، و٧٧٠ عندنا و٦٦٠ عند بوسطة.
 *
 * **والرقم ٣٠ مقروء من البيانات مش متخمّن**: في ٨٧٥ أوردر مربوط على
 * التلات بيزنس، أقصى فرق سليم كان ١٣ يوم، وأقرب ربط غلط كان ٦٠ يوم.
 * فالحد في نص الفجوة — بيقفل الأربعة الغلط وما بيلمسش ٨٧١ ربط صح.
 */
export const STALE_SHIPMENT_DAYS = 30;

/** الشحنة أقدم من الأوردر بأكتر من الحد؟ لو تاريخ ناقص بنعدّي */
export function shipmentTooOld(
  deliveryCreatedAt: string | null | undefined,
  orderDate: string | null | undefined
): boolean {
  if (!deliveryCreatedAt || !orderDate) return false;
  const d = new Date(deliveryCreatedAt).getTime();
  const o = new Date(orderDate).getTime();
  if (Number.isNaN(d) || Number.isNaN(o)) return false;
  return o - d > STALE_SHIPMENT_DAYS * 86_400_000;
}

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
    const confirmed = (index.byPhone.get(key) ?? []).filter(
      (o) =>
        namesShare(o.customerName ?? "", d.receiver?.fullName ?? "") &&
        // والتاريخ شرط تالت — اقرا `STALE_SHIPMENT_DAYS` فوق
        !shipmentTooOld(d.createdAt, o.orderDate)
    );
    if (confirmed.length === 1) return { kind: "phone", order: confirmed[0] };
  }

  return { kind: "none" };
}
