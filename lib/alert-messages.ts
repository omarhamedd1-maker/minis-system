// ==========================================================================
// نصوص التنبيهات
// --------------------------------------------------------------------------
// كانت جوّه ملف تليجرام، وتليجرام اتشال — بس النصوص نفسها لسه مستخدمة
// مع إشعارات الموبايل. الوسوم (<b> و<code>) بتتشال قبل الإشعار في
// `lib/push/notify.ts`، فسيبها زي ما هي.
//
// **رقم الأوردر واسم العميل في السطر الأول** — ده اللي بيبان في الإشعار
// على الموبايل من غير ما تفتحه.
// ==========================================================================

export type FailedDeliveryAlert = {
  orderNumber: string | number | null;
  customerName: string | null;
  customerPhone: string | null;
  tracking: string | null;
  /** سبب بوسطة لو كتبته */
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
 */
export function failedDeliveryMessage(a: FailedDeliveryAlert): string {
  // رقم الأوردر واسم العميل في **السطر الأول** — ده اللي بيبان في الإشعار
  // على الموبايل من غير ما تفتحه
  const who = a.customerName ? ` — ${a.customerName}` : "";
  const lines = [
    a.waiting
      ? `🛑 <b>أوردر ${a.orderNumber ?? "—"} بوسطة مستنية قرار منك${who}</b>`
      : a.arrived
        ? `📦 <b>أوردر ${a.orderNumber ?? "—"} رجع ومتسلّمش${who}</b>`
        : `⚠️ <b>أوردر ${a.orderNumber ?? "—"} العميل مستلمش${who}</b>`,
    "",
  ];
  if (a.customerPhone) lines.push(`تليفون: ${a.customerPhone}`);
  if (a.tracking) lines.push(`شحنة: <code>${a.tracking}</code>`);
  if (a.reason) lines.push(`سبب بوسطة: ${a.reason}`);
  lines.push("");
  lines.push(
    a.waiting
      ? "بوسطة خلّصت محاولاتها ورفعت إيدها. كلّم العميل واطلب محاولة تانية، أو قول لبوسطة ترجّعها."
      : a.arrived
        ? "البضاعة رجعت — راجع المخزون والفلوس."
        : "كلّم العميل قبل ما الشحنة ترجع المخزن."
  );
  if (a.siteUrl) {
    lines.push(`${a.siteUrl}/orders?status=${a.arrived ? "returned" : "returning"}`);
  }
  return lines.join("\n");
}

/** رسالة "المزامنة واقفة" */
export function syncDownMessage(detail: string, siteUrl?: string | null): string {
  const lines = ["🔴 <b>المزامنة مع بوسطة واقفة</b>", "", detail, ""];
  lines.push("الحالات والتحصيل مش بيتحدّثوا — الأرقام في السيستم قديمة.");
  if (siteUrl) lines.push(siteUrl);
  return lines.join("\n");
}
