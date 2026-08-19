// ==========================================================================
// اسأل بعد التسليم
// --------------------------------------------------------------------------
// العميل اللي عنده مشكلة في المنتج بيسكت وبعدين يعمل مرتجع. والسؤال البسيط
// بعد التسليم بكام يوم بيخلّي المشكلة توصلك **قبل** ما تتحوّل لشحنة عكسية
// برسومها وبضاعتها اللي بترجع اتحركت مرتين.
//
// ⚠️⚠️ **مافيش إرسال تلقائي هنا.** القايمة بتقول **مين** يتكلّم و**النص**
// اللي يتبعت، والإرسال بإيدك. الرسالة اللي بتروح لوحدها لعميل مالهوش دعوة
// أوحش من إنها ماتروحش — والقناة نفسها (واتساب) لسه ماتربطتش.
//
// ⚠️ **والراجع بره القايمة** — العميل اللي رجّع البضاعة مش هنسأله «كل حاجة
// تمام؟».
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات، والوقت بيتبعت جوّه.
// ==========================================================================

import { renderTemplate } from "./message-template";

/**
 * ⚠️ **بعد كام يوم من التسليم.**
 *
 * قبل اليومين العميل غالبًا لسه مافتحش الكرتونة. وبعد الأسبوع السؤال بيبقى
 * متأخر — لو فيه مشكلة يكون عملها مرتجع خلاص.
 */
export const ASK_AFTER_DAYS = 3;
export const ASK_BEFORE_DAYS = 10;

export type FollowupOrder = {
  id: string;
  orderNumber: string | null;
  orderStatus: string | null;
  deliveredAt: string | null;
  /** اتسأل قبل كده؟ */
  followedUpAt?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** المنتجات — بتدخل في نص الرسالة */
  products?: string[] | null;
};

export type FollowupRow = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  /** ⚠️ مضمون إنه مش فاضي — اللي مالوش تليفون مابيدخلش الطابور أصلًا */
  customerPhone: string;
  /** اتسلّم من كام يوم */
  days: number;
  /** الرسالة الجاهزة */
  message: string;
};

function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  const d = Math.floor((now.getTime() - t) / 86_400_000);
  return d < 0 ? null : d;
}

/**
 * نص الرسالة لعميل واحد.
 *
 * ⚠️ **القالب بتاع صاحب المتجر** (`lib/message-template.ts`) — الكلام ده
 * بيروح لعملاءه بصوته هو، فمينفعش يبقى مكتوب في الكود.
 */
export function followupMessage(
  customerName: string | null | undefined,
  products: string[] | null | undefined,
  storeName?: string | null,
  template?: string | null,
  orderNumber?: string | null
): string {
  const list = (products ?? []).filter(Boolean);
  return renderTemplate(template, {
    // الاسم الأول بس — «أهلًا مروة شهاب أحمد» بتتقري كرسالة من بنك
    الاسم: String(customerName ?? "").trim().split(" ")[0],
    المنتج:
      list.length === 1
        ? list[0]
        : list.length > 1
          ? `${list[0]} واللي معاه`
          : "",
    "رقم الأوردر": orderNumber ?? "",
    المتجر: storeName ?? "",
  });
}

/**
 * مين يتسأل النهاردة.
 *
 * بيرجّع **الأقدم الأول** — ده اللي قرّب يخرج من الوقت المفيد.
 */
export function followupQueue(
  orders: FollowupOrder[],
  now: Date,
  storeName?: string | null,
  template?: string | null
): FollowupRow[] {
  const out: FollowupRow[] = [];

  for (const o of orders) {
    // ⚠️ المسلّم بس — الراجع والملغي مالهمش سؤال
    if (o.orderStatus !== "delivered") continue;
    if (o.followedUpAt) continue;

    const days = daysSince(o.deliveredAt, now);
    if (days === null) continue;
    if (days < ASK_AFTER_DAYS || days > ASK_BEFORE_DAYS) continue;

    // من غير تليفون مافيش طريقة تكلّمه — والسطر بيبقى مجرد لوم
    const phone = String(o.customerPhone ?? "").trim();
    if (!phone) continue;

    out.push({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName ?? null,
      customerPhone: phone,
      days,
      message: followupMessage(
        o.customerName,
        o.products,
        storeName,
        template,
        o.orderNumber
      ),
    });
  }

  return out.sort((a, b) => b.days - a.days);
}

/**
 * رابط واتساب جاهز بالرسالة.
 *
 * ⚠️ **التليفون المصري لازم يبقى بكود الدولة** — `01001234567` بيتحوّل
 * لـ`201001234567`. من غير الكود واتساب بيفتح على رقم غلط أو مايفتحش خالص.
 */
export function whatsappLink(phone: string, message: string): string {
  const digits = String(phone ?? "").replace(/[^0-9]/g, "");
  const withCode = digits.startsWith("20")
    ? digits
    : digits.startsWith("0")
      ? `20${digits.slice(1)}`
      : digits;
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`;
}
