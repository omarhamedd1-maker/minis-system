// ==========================================================================
// الأوردر اللي لسه "جديد" — محدش أكّده
// --------------------------------------------------------------------------
// دوال صافية. الأوردر بينزل من شوبيفاي بحالة "جديد"، ولازم حد يكلّم العميل
// ويأكّده. لو قعد كده، البضاعة محجوزة والعميل مستني ومحدش واخد باله.
//
// **التنبيه هنا يومي مش على مراحل** — بخلاف الشحنة الواقفة (٣/٧/١٠/١٣).
// عمر طلبها كده بالنص: كل يوم لحد ما يأكّد. وبنسجّل آخر يوم نبّهنا فيه
// عشان تبقى مرة واحدة في اليوم مش كل ١٥ دقيقة.
// ==========================================================================

import { alertHead } from "./alert-messages";

export type UnconfirmedCheck = {
  days: number;
  /** اليوم اللي ننبّه عليه دلوقتي، أو null لو مفيش */
  day: number | null;
  skip?: "not_new" | "no_date" | "too_soon" | "already_alerted";
};

export function checkUnconfirmed(input: {
  orderStatus: string | null | undefined;
  orderDate: string | null | undefined;
  remindedDay: number | null | undefined;
  now: Date;
}): UnconfirmedCheck {
  const { orderStatus, orderDate, remindedDay, now } = input;

  // أي حالة غير "جديد" معناها إن حد لمسه خلاص
  if (orderStatus !== "new") return { days: 0, day: null, skip: "not_new" };
  if (!orderDate) return { days: 0, day: null, skip: "no_date" };

  const days = Math.floor(
    (now.getTime() - new Date(orderDate).getTime()) / 86_400_000
  );

  if (days < 1) return { days, day: null, skip: "too_soon" };
  // نبّهنا النهاردة خلاص؟
  if (days <= Number(remindedDay ?? 0)) {
    return { days, day: null, skip: "already_alerted" };
  }

  return { days, day: days };
}

/** رسالة "الأوردر لسه مش مؤكد" */
export function unconfirmedMessage(a: {
  orderNumber: string | number | null;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  days: number;
  siteUrl?: string | null;
}): string {
  const lines = alertHead(
    "📞",
    `أوردر ${a.orderNumber ?? "—"} لسه مش مؤكد`,
    a.customerName
  );
  if (a.customerPhone) lines.push(`تليفون: ${a.customerPhone}`);
  if (a.total > 0) lines.push(`المبلغ: ${a.total} جنيه`);
  lines.push(
    a.days === 1 ? "نزل امبارح ومحدش أكّده." : `نزل من ${a.days} يوم ومحدش أكّده.`
  );
  lines.push("");
  lines.push("كلّم العميل وأكّد الأوردر — والتنبيه هيفضل ييجي كل يوم لحد ما تأكّده.");
  if (a.siteUrl) lines.push(`${a.siteUrl}/orders?status=new`);
  return lines.join("\n");
}

/**
 * الحد اللي بعده بنجمّع التنبيهات في رسالة واحدة.
 * لو ٦ أوردرات محتاجين تنبيه، ٦ رسايل في نفس اللحظة بتبقى إزعاج ومحدش
 * بيقراها — رسالة واحدة بالعدد أنفع.
 */
export const GROUP_ABOVE = 5;

/** رسالة مجمّعة لما العدد يزيد */
export function unconfirmedGroupMessage(a: {
  count: number;
  oldestDays: number;
  siteUrl?: string | null;
}): string {
  const lines = [
    `📞 <b>عندك ${a.count} أوردر لسه مش مؤكدين</b>`,
    "",
    a.oldestDays === 1
      ? "أقدم واحد نزل امبارح."
      : `أقدم واحد نزل من ${a.oldestDays} يوم.`,
    "",
    "افتحهم وكلّم العملاء — التنبيه هيفضل ييجي كل يوم لحد ما تأكّدهم.",
  ];
  if (a.siteUrl) lines.push(`${a.siteUrl}/orders?status=new`);
  return lines.join("\n");
}
