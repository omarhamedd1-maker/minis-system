import type { PermissionKey } from "./permission-keys";

// ==========================================================================
// لوحة اليوم — إيه اللي مستنيك دلوقتي
// --------------------------------------------------------------------------
// الشاشات التانية بتجاوب «كسبت كام» و«فين التسريب». اللوحة دي بتجاوب سؤال
// تالت خالص: **أبدأ منين النهاردة؟** بدل ما تلف على خمس قوايم عشان تعرف
// إن فيه ٧ أوردرات مؤكدة ومستنية بوليصة.
//
// كل سطر فيه **رقم ولينك**، واللينك بيودّي على نفس الأوردرات بالظبط
// (`/orders?only=…`) — مش على فلتر قريب منها. الفرق مهم: السطر اللي بيقول
// «٣ شحنات واقفة» لازم يفتح التلات دول، مش كل اللي عند بوسطة.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات ولا `Date.now()`؛ الوقت
// بيتبعت جوّه عشان الاختبار يبقى ثابت.
// ==========================================================================

/**
 * ⚠️ **الشحنة بتبقى «واقفة» بعد كام يوم.**
 *
 * متوسط التوصيل عندنا حوالين يومين، والتلاتة بيحصلوا عادي في المواسم.
 * الخمسة معناها إن فيه حاجة غلط فعلًا — عنوان، أو مندوب سايبها.
 */
export const STUCK_DAYS = 5;

export type BoardOrder = {
  id: string;
  orderStatus: string | null;
  bostaTracking?: string | null;
  bostaCreatedAt?: string | null;
  bostaCod?: number | null;
  bostaCollected?: boolean | null;
  /** مجموع الكميات الراجعة المتسجّلة على البنود */
  returnedQty?: number | null;
  /** المستحق للعميل من البنود الراجعة (`refundDue`) */
  refundDue?: number | null;
  refundedAt?: string | null;
  /**
   * سبب استثناء الأوردر من «مرتجع محتاج تسجيل» (`orders.return_skip_reason`).
   * ⚠️ **علامة على الأوردر مش تاريخ في الكود** — السبب مكتوب مكانه، ولو
   * اتشالت الأوردر بيرجع للطابور.
   */
  returnSkip?: string | null;
};

export type BoardRow = {
  key: string;
  label: string;
  count: number;
  /** فلوس مرتبطة بالسطر (الجنيهات اللي عند بوسطة مثلًا) */
  money?: number;
  /** لينك بيفتح نفس الأوردرات دي بالظبط */
  href: string;
  /** السطر ده محتاج تصرّف منك ولا مجرد خبر */
  urgent: boolean;
};

/** عدد الأيام من تاريخ لتاريخ — و`null` لو التاريخ مش مقروء */
function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/**
 * ⚠️ **اللينك بيتقصّ عند حد معيّن.**
 *
 * لينك فيه ٤٠٠ معرّف بيوصل لكيلومتر ونص، وسيرفرات كتير بتقطعه. فوق الحد
 * ده بنرجّع فلتر عادي — أوسع شوية، بس بيفتح.
 */
const MAX_IDS_IN_LINK = 60;

function link(ids: string[], fallback: string): string {
  if (ids.length === 0 || ids.length > MAX_IDS_IN_LINK) return fallback;
  return `/orders?only=${ids.join(",")}`;
}

/**
 * شحنة واقفة: عند بوسطة وعدّى عليها `STUCK_DAYS`. مصدر واحد — لوحة `/work`
 * وخلفية كارت الأوردر بيسألوا نفس السؤال.
 */
export function isStuckShipment(
  o: Pick<BoardOrder, "orderStatus" | "bostaCreatedAt">,
  now: Date
): boolean {
  if (!["shipped", "out_for_delivery"].includes(String(o.orderStatus))) return false;
  const d = daysSince(o.bostaCreatedAt, now);
  return d !== null && d >= STUCK_DAYS;
}

/**
 * لوحة اليوم.
 *
 * السطور مترتبة بالأقرب للفلوس: حاجة مستنية إيدك الأول، وبعدين اللي مستني
 * حد تاني (بوسطة أو العميل).
 */
export function dailyBoard(orders: BoardOrder[], now: Date): BoardRow[] {
  const pick = (fn: (o: BoardOrder) => boolean) => orders.filter(fn);

  const needConfirm = pick((o) => o.orderStatus === "new");

  // مؤكد أو متجهّز، ولسه ماخدش رقم تتبع من بوسطة
  const needShip = pick(
    (o) =>
      ["confirmed", "packed"].includes(String(o.orderStatus)) &&
      !String(o.bostaTracking ?? "").trim()
  );

  const needAction = pick((o) => o.orderStatus === "awaiting_action");

  const stuck = pick((o) => isStuckShipment(o, now));

  const coming = pick((o) => o.orderStatus === "returning");

  // ⚠️ «فلوس عند بوسطة» اتشالت (١٧ سبتمبر): على مينيز و2 SEC صفر دايمًا —
  // بوسطة بتحوّل بسرعة، واللي «ماتحصّلش» كله من غير رقم تتبع يعني مش عندها.

  // المرتجع بعد التسليم على مرحلتين متتابعتين — الأوردر في واحدة بس:
  // ١. لسه ماتسجّلش رجع منه إيه (ومش مستثنى)
  const returned = (o: BoardOrder) => o.orderStatus === "returned_after_delivery";
  const toRegister = pick(
    (o) =>
      returned(o) &&
      !String(o.returnSkip ?? "").trim() &&
      Number(o.returnedQty ?? 0) <= 0
  );
  // ٢. اتسجّل وعليه مستحق ولسه ماتأكّدش التحويل. من غير مستحق = برّه الاتنين
  const toRefund = pick(
    (o) =>
      returned(o) &&
      Number(o.returnedQty ?? 0) > 0 &&
      !o.refundedAt &&
      Number(o.refundDue ?? 0) > 0
  );

  const ids = (list: BoardOrder[]) => list.map((o) => o.id);

  return [
    {
      key: "confirm",
      label: "أوردر جديد محتاج تأكيد",
      count: needConfirm.length,
      href: link(ids(needConfirm), "/orders?status=new"),
      urgent: needConfirm.length > 0,
    },
    {
      key: "ship",
      label: "مؤكد ومستني بوليصة",
      count: needShip.length,
      href: link(ids(needShip), "/orders?status=confirmed"),
      urgent: needShip.length > 0,
    },
    {
      key: "action",
      label: "بوسطة واقفة ومستنياك",
      count: needAction.length,
      href: link(ids(needAction), "/orders?status=awaiting_action"),
      urgent: needAction.length > 0,
    },
    {
      key: "stuck",
      label: `شحنة عدّى عليها ${STUCK_DAYS} أيام وماوصلتش`,
      count: stuck.length,
      href: link(ids(stuck), "/orders?status=shipped"),
      urgent: stuck.length > 0,
    },
    {
      key: "returning",
      label: "راجعة لك",
      count: coming.length,
      href: link(ids(coming), "/orders?status=returning"),
      urgent: false,
    },
    {
      key: "register",
      label: "مرتجع محتاج تسجيل",
      count: toRegister.length,
      href: link(ids(toRegister), "/orders?status=returned_after_delivery"),
      urgent: toRegister.length > 0,
    },
    {
      key: "refund",
      label: "ريفند ماتحوّلش",
      count: toRefund.length,
      money: toRefund.reduce((s, o) => s + Number(o.refundDue ?? 0), 0),
      href: link(ids(toRefund), "/orders?status=returned_after_delivery"),
      urgent: toRefund.length > 0,
    },
  ];
}

/** فيه حاجة مستنية إيدك؟ */
export function boardIsClear(rows: BoardRow[]): boolean {
  return rows.every((r) => !r.urgent);
}

// ==========================================================================
// صلاحيات السطور وترتيبها — في الملف الصافي عشان الاختبار يوصلها
// ==========================================================================

/**
 * ⚠️ **السطر اللي مالوش صلاحية بيتشال خالص** — مش بيتعطّل ولا بيبان باهت.
 * موظف التغليف مايشوفش «ريفند ماتحوّلش» (فلوس) ومايعرفش إنه موجود أصلًا.
 * السطور اللي مش هنا مفتوحة لأي حد بيشوف الأوردرات.
 */
export const ROW_PERMISSION: Partial<Record<string, PermissionKey>> = {
  refund: "cash.view",
};

export function visibleRows(
  rows: BoardRow[],
  has: (perm: PermissionKey) => boolean
): BoardRow[] {
  return rows.filter((r) => {
    const perm = ROW_PERMISSION[r.key];
    return !perm || has(perm);
  });
}

/**
 * اللي محتاج إيدك الأول. الترتيب **جوّه** كل مجموعة زي ما هو —
 * كارت بيقفز مكانه كل ما رقم يتغيّر بيضيّع الذاكرة العضلية.
 */
export function sortByUrgent(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => Number(b.urgent) - Number(a.urgent));
}
