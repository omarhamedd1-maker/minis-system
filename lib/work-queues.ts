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
