/**
 * ==========================================================================
 * طوابير `/work` اللي مصدرها مش الأوردرات (PHASE2 §الجزء التالت)
 * --------------------------------------------------------------------------
 * `lib/daily-board.ts` بيعدّ من قايمة الأوردرات. الطوابير دي مصدرها جداول
 * تانية (طلبات الحذف · التقييمات) أو حقل جوّه البنود (التكلفة)، فاتحطت هنا
 * — بنفس شكل السطر عشان الصفحة تعرضهم زي بعض.
 *
 * ⚠️ **اللي بيطلع صفر بالتصميم مابيتضافش** (قرار ١٧ سبتمبر). اتقاس على
 * مينيز قبل ما يتكتب:
 *   · «مخزون قرب يخلص» — صفر: `runningOut` بيطلب ٣ قطع في ٣٠ يوم عشان
 *     يحسب معدّل، ومينيز بتبيع أقل من كده لكل شكل. والإشارة ليها مكان
 *     في صفحة المنتجات أصلًا.
 *   · «عنوان ناقص» — صفر: العناوين من شوبيفاي ٣٣ حرف فأكتر، وكل
 *     التليفونات صحيحة.
 *
 * **الملف ده صافي** — بياخد أرقام وبيرجّع سطور.
 * ==========================================================================
 */

import type { BoardRow } from "./daily-board";

export type ExtraInput = {
  /** طلبات حذف لسه مستنية موافقة — ومعاها أوردراتها عشان اللينك */
  deletionOrderIds: string[];
  /** تقييمات سيئة (٣ نجوم أو أقل) لسه محدش شافها */
  badRatings: number;
  /** أوردرات فيها بند بتكلفة صفر — الربح عليها غلط */
  zeroCostOrderIds: string[];
};

/** لينك بيفتح نفس الأوردرات — نفس حد `daily-board` */
const MAX_IDS_IN_LINK = 60;
const link = (ids: string[], fallback: string) =>
  ids.length > 0 && ids.length <= MAX_IDS_IN_LINK
    ? `/orders?only=${ids.join(",")}`
    : fallback;

export function extraQueues(input: ExtraInput): BoardRow[] {
  return [
    {
      key: "deletion",
      label: "طلب حذف مستني موافقة",
      count: input.deletionOrderIds.length,
      href: link(input.deletionOrderIds, "/orders"),
      urgent: input.deletionOrderIds.length > 0,
    },
    {
      key: "rating",
      label: "تقييم سيء",
      count: input.badRatings,
      href: "/orders/ratings",
      // مش شغل واقف — بس محتاج تتصرّف مع العميل
      urgent: false,
    },
    {
      key: "zero_cost",
      label: "أوردر بتكلفة صفر",
      count: input.zeroCostOrderIds.length,
      href: link(input.zeroCostOrderIds, "/products?missing_cost=1"),
      // الربح عليه غلط، بس مش بيوقف شحنة
      urgent: false,
    },
  ];
}

// ==========================================================================
// التقسيم — أربع مجموعات (PHASE2)
// --------------------------------------------------------------------------
// ١١ كارت جنب بعض بيبقوا قايمة أرقام. المجموعة بتقول **مين مستني مين**:
// اللي في إيدك دلوقتي · اللي مستني حد تاني · فرص فلوس · شغل الفريق.
//
// ⚠️ **كل سطر لازم يبقى في مجموعة** — عليه اختبار. السطر اللي مالوش
// مجموعة كان هيختفي من الصفحة وهو بيتحسب.
// ==========================================================================

export type QueueGroupKey = "mine" | "others" | "chances" | "team";

export const QUEUE_GROUPS: { key: QueueGroupKey; label: string; note: string }[] = [
  { key: "mine", label: "مستني إيدك", note: "مفيش حد تاني هيعمله" },
  { key: "others", label: "مستني حد تاني", note: "عند بوسطة أو في السكة" },
  { key: "chances", label: "فرص", note: "فلوس ممكن ترجع لو اتصرّفت" },
  { key: "team", label: "الفريق", note: "شغل مشترك" },
];

/** سطور اللوحة والطوابير — كل مفتاح ومجموعته */
export const ROW_GROUP: Record<string, QueueGroupKey> = {
  confirm: "mine",
  ship: "mine",
  action: "mine",
  register: "mine",
  refund: "mine",
  deletion: "mine",
  zero_cost: "mine",
  stuck: "others",
  returning: "others",
  rating: "chances",
};

export function groupOfRow(key: string): QueueGroupKey {
  return ROW_GROUP[key] ?? "mine";
}

/** الطوابير اللي ليها صفحاتها — لينك من غير عدّاد */
export type QueueLink = {
  href: string;
  label: string;
  note: string;
  /** اسم الصلاحية — الكارت اللي مالهاش بيتشال خالص */
  perm: string;
  group: QueueGroupKey;
};

export const QUEUE_LINKS: QueueLink[] = [
  { href: "/orders/rescue", label: "اتصل قبل ما ترجع", note: "شحنات على وش رجوع", perm: "orders.view", group: "chances" },
  { href: "/orders/carts", label: "سلات متروكة", note: "دخل وساب العربية", perm: "orders.view", group: "chances" },
  { href: "/orders/followup", label: "اسأل بعد التسليم", note: "عميل استلم من كام يوم", perm: "orders.view", group: "chances" },
  { href: "/orders/risky", label: "محتاجة نظرة", note: "أوردرات فيها ريبة", perm: "orders.view", group: "mine" },
  { href: "/orders/reconcile", label: "مراجعة الشحنات", note: "أرقام بوسطة مقابل عندنا", perm: "finance.dashboard", group: "mine" },
  { href: "/tasks", label: "التاسكات", note: "اللي عليك وعلى الفريق", perm: "tasks.view", group: "team" },
  { href: "/inbox", label: "الرسايل", note: "رد على العملاء", perm: "inbox.view", group: "team" },
];
