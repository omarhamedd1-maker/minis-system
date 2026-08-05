// ==========================================================================
// فلوس المرتجع — الحسبة والتنبيه
// --------------------------------------------------------------------------
// دوال صافية بالكامل. بوسطة مابتدفعش للعميل، فإنت اللي بتحوّله. والحوالة
// دي مالهاش أثر في السيستم، فبنعمل حاجتين:
//
//   ١. نحسب المبلغ المقترح من البنود اللي رجعت فعلاً.
//   ٢. ننبّه بعد يوم و٣ و٧ و١٠ لحد ما تأكّد إنك حوّلت.
//
// **الشحن مش داخل في المرتجع بقصد** — الشحنة اتعملت والمندوب اتحرك، فالفلوس
// دي راحت. لو عايز ترجّعها للعميل كمجاملة تقدر تعدّل المبلغ بإيدك.
// ==========================================================================

import { alertHead } from "./alert-messages";

/** مراحل تنبيه الحوالة بالأيام من ساعة ما المرتجع اتسجّل */
export const REFUND_MILESTONES = [1, 3, 7, 10] as const;

export type RefundItem = {
  returnedQuantity: number | null;
  salePriceAtOrder: number;
};

/**
 * المبلغ المفروض يرجع للعميل = مجموع (الكمية الراجعة × سعر بيعها).
 * الخصم مش بيتخصم تاني — سعر البند المحفوظ هو السعر اللي العميل دفعه فعلاً.
 */
export function refundDue(items: RefundItem[]): number {
  const total = items.reduce(
    (s, i) => s + Number(i.returnedQuantity ?? 0) * Number(i.salePriceAtOrder),
    0
  );
  return Math.max(0, Math.round(total * 100) / 100);
}

export type RefundCheck = {
  days: number;
  /** المرحلة اللي ننبّه عليها دلوقتي، أو null */
  milestone: number | null;
  skip?: "not_returned" | "already_refunded" | "nothing_due" | "no_date" | "too_soon" | "already_alerted";
};

export function checkRefundDue(input: {
  orderStatus: string | null | undefined;
  /** امتى المرتجع اتسجّل (تاريخ تحويل الحالة) */
  returnedAt: string | null | undefined;
  refundedAt: string | null | undefined;
  amountDue: number;
  remindedDay: number | null | undefined;
  now: Date;
}): RefundCheck {
  const { orderStatus, returnedAt, refundedAt, amountDue, remindedDay, now } =
    input;

  if (orderStatus !== "returned_after_delivery") {
    return { days: 0, milestone: null, skip: "not_returned" };
  }
  // حوّلت خلاص؟ خلصنا
  if (refundedAt) return { days: 0, milestone: null, skip: "already_refunded" };
  if (amountDue <= 0) return { days: 0, milestone: null, skip: "nothing_due" };
  if (!returnedAt) return { days: 0, milestone: null, skip: "no_date" };

  const days = Math.floor(
    (now.getTime() - new Date(returnedAt).getTime()) / 86_400_000
  );

  const reached = [...REFUND_MILESTONES].reverse().find((m) => days >= m);
  if (reached === undefined) return { days, milestone: null, skip: "too_soon" };
  if (reached <= Number(remindedDay ?? 0)) {
    return { days, milestone: null, skip: "already_alerted" };
  }

  return { days, milestone: reached };
}

/** رسالة "لسه مارجّعتش فلوس العميل" */
export function refundReminderMessage(a: {
  orderNumber: string | number | null;
  customerName: string | null;
  customerPhone: string | null;
  amount: number;
  days: number;
}): string {
  const lines = alertHead(
    "💸",
    `أوردر ${a.orderNumber ?? "—"} لسه مارجّعتش فلوسه`,
    a.customerName
  );
  if (a.customerPhone) lines.push(`تليفون: ${a.customerPhone}`);
  lines.push(`المبلغ: <b>${a.amount} جنيه</b>`);
  lines.push(
    a.days <= 1
      ? "المرتجع اتسجّل امبارح."
      : `المرتجع اتسجّل من ${a.days} يوم.`
  );
  lines.push("");
  lines.push("حوّله وبعدين أكّد من جوّه الأوردر عشان التنبيه يوقف.");
  return lines.join("\n");
}
