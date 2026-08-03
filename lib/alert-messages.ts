// ==========================================================================
// نصوص التنبيهات
// --------------------------------------------------------------------------
// كانت جوّه ملف تليجرام، وتليجرام اتشال — بس النصوص نفسها لسه مستخدمة
// مع إشعارات الموبايل. الوسوم (<b> و<code>) بتتشال قبل الإشعار في
// `lib/push/notify.ts`، فسيبها زي ما هي.
//
// **الشكل واحد في كل إشعار من غير استثناء**: رقم الأوردر في السطر الأول،
// واسم العميل في السطر التاني تحته. السطر الأول بيبقى عنوان الإشعار على
// الموبايل والباقي جسمه، فالاسم بيبان قبل أي تفصيلة تانية.
//
// **ورقم الشحنة مابيدخلش أي إشعار.** رقم من ٨ أرقام مالوش أي معنى على شاشة
// القفل، وكان بياخد سطر من مساحة ضيقة أصلاً — واللي عايزه بيلاقيه في الأوردر.
// ==========================================================================

import { exceptionAdvice } from "./bosta/exception";

/**
 * أول سطرين في أي إشعار.
 * لو مافيش اسم بنسيب السطر فاضي عشان الشكل مايختلفش والجسم يفضل مفصول.
 */
export function alertHead(
  icon: string,
  headline: string,
  customerName: string | null | undefined
): string[] {
  return [`${icon} <b>${headline}</b>`, String(customerName ?? "").trim()];
}

export type FailedDeliveryAlert = {
  orderNumber: string | number | null;
  customerName: string | null;
  customerPhone: string | null;
  /** سبب بوسطة لو كتبته — هو اللي بيحدد الجملة الأخيرة */
  reason: string | null;
  /** رجعت خلاص ولا لسه في الطريق لينا */
  arrived: boolean;
  /** بوسطة واقفة ومستنية قرار مننا — مش راجعة (لسه) */
  waiting?: boolean;
  siteUrl?: string | null;
};

/**
 * رسالة "العميل مستلمش".
 * دي أهم تنبيه في السيستم — معناها بضاعة راجعة وفلوس ماوصلتش، ولازم حد
 * يكلّم العميل **دلوقتي** قبل ما الشحنة توصل المخزن وتبقى خسارة مؤكدة.
 *
 * ولما بوسطة تكون واقفة مستنية قرار، الجملة بتتكتب من سبب الوقوف الحقيقي
 * (`exceptionAdvice`) — مش جملة واحدة محفوظة لكل الحالات.
 */
export function failedDeliveryMessage(a: FailedDeliveryAlert): string {
  const headline = a.waiting
    ? `أوردر ${a.orderNumber ?? "—"} ${exceptionAdvice(a.reason).title}`
    : a.arrived
      ? `أوردر ${a.orderNumber ?? "—"} رجع ومتسلّمش`
      : `أوردر ${a.orderNumber ?? "—"} العميل مستلمش`;

  const lines = alertHead(a.waiting ? "🛑" : a.arrived ? "📦" : "⚠️", headline, a.customerName);

  if (a.customerPhone) lines.push(`تليفون: ${a.customerPhone}`);
  if (a.reason) lines.push(`سبب بوسطة: ${a.reason}`);
  lines.push("");
  lines.push(
    a.waiting
      ? exceptionAdvice(a.reason).hint
      : a.arrived
        ? "البضاعة رجعت — راجع المخزون والفلوس."
        : "كلّم العميل قبل ما الشحنة ترجع المخزن."
  );
  if (a.siteUrl) {
    lines.push(`${a.siteUrl}/orders?status=${a.arrived ? "returned" : "returning"}`);
  }
  return lines.join("\n");
}

/** رسالة "المزامنة واقفة" — دي مالهاش عميل، فمفيش سطر تاني */
export function syncDownMessage(detail: string, siteUrl?: string | null): string {
  const lines = ["🔴 <b>المزامنة مع بوسطة واقفة</b>", "", detail, ""];
  lines.push("الحالات والتحصيل مش بيتحدّثوا — الأرقام في السيستم قديمة.");
  if (siteUrl) lines.push(siteUrl);
  return lines.join("\n");
}
