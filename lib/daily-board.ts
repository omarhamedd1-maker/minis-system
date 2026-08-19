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

  const stuck = pick((o) => {
    if (!["shipped", "out_for_delivery"].includes(String(o.orderStatus))) {
      return false;
    }
    const d = daysSince(o.bostaCreatedAt, now);
    return d !== null && d >= STUCK_DAYS;
  });

  const coming = pick((o) => o.orderStatus === "returning");

  // اتسلّم والفلوس لسه عند بوسطة
  const money = pick(
    (o) =>
      o.orderStatus === "delivered" &&
      !o.bostaCollected &&
      Number(o.bostaCod ?? 0) > 0
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
      key: "money",
      label: "فلوس عند بوسطة",
      count: money.length,
      money: money.reduce((s, o) => s + Number(o.bostaCod ?? 0), 0),
      href: link(ids(money), "/orders?status=delivered"),
      urgent: false,
    },
  ];
}

/** فيه حاجة مستنية إيدك؟ */
export function boardIsClear(rows: BoardRow[]): boolean {
  return rows.every((r) => !r.urgent);
}
