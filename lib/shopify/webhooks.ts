// ==========================================================================
// ويب هوكس شوبيفاي الإجبارية
// --------------------------------------------------------------------------
// عشان التطبيق يبقى **عام** (أي متجر يركّبه بضغطة)، شوبيفاي بتراجعه —
// وأول حاجة بتتأكد منها إن التلاتة دول موجودين وشغالين:
//
//   customers/data_request   عميل طلب نسخة من بياناته
//   customers/redact         عميل طلب مسح بياناته
//   shop/redact              متجر شال التطبيق و٤٨ ساعة عدّت — امسح كل حاجة
//
// **ومن غيرهم المراجعة بترفض من أول يوم**، مهما كان الباقي شغال.
//
// وضفنا معاهم `app/uninstalled` — مش إجباري، بس من غيره المتجر اللي شال
// التطبيق بيفضل توكنه محفوظ عندنا والمزامنة بتحاول تناديه للأبد.
//
// ⚠️ **التوقيع هنا غير توقيع الدخول.** ده على **جسم الطلب الخام** بالظبط
// (`base64` مش `hex`)، وأي تعديل في النص — حتى مسافة — بيكسره. عشان كده
// المسار بيقرا النص الخام مش JSON متفكوك.
//
// دوال صافية بالكامل.
// ==========================================================================

import crypto from "node:crypto";

/** الموضوعات اللي بنرد عليها. أي حاجة تانية بنقول «تمام» ونعدّي */
export const HANDLED_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
  "app/uninstalled",
  // ⚠️ **ده اللي بيخلّي الأوردر يوصل في ثواني بدل ربع ساعة.**
  //
  // قبل كده الأوردر الجديد كان بيروح لدالة `shopify-order` في سوبابيز —
  // ودي **مابتكتبش رقم البيزنس**، فكانت بتعتمد على القيمة الافتراضية في
  // الداتابيز وتحط كل أوردر عند مينيز مهما كان المتجر.
  //
  // ولما الافتراضي ده اتقفل (١٧ أغسطس)، الدالة بقت ترد ٥٠٠ في كل مرة
  // (`null value in column "tenant_id"`) وشوبيفاي فضلت تعيد المحاولة.
  // فالأوردر بقى بيوصل من اللفة الدورية بس — لحد ربع ساعة.
  //
  // المسار ده بيطلّع البيزنس من **دومين المتجر**، فبيشتغل صح لأي بيزنس.
  "orders/create",
] as const;

export type WebhookTopic = (typeof HANDLED_TOPICS)[number];

/**
 * التوقيع ده من شوبيفاي فعلًا؟
 *
 * **المقارنة بـ`timingSafeEqual` مش `===`** — المقارنة العادية بتخلص بدري
 * لما أول حرف يختلف، وده بيسرّب معلومة عن التوقيع الصح.
 *
 * وبنتأكد إن الطولين واحد الأول، لأن `timingSafeEqual` بترمي استثناء لو
 * اختلفوا — والاستثناء ده نفسه بيسرّب.
 */
export function verifyWebhook(
  rawBody: string,
  signature: string | null,
  clientSecret: string
): boolean {
  if (!signature || !clientSecret) return false;

  const digest = crypto
    .createHmac("sha256", clientSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

export type WebhookRequest = {
  topic: string | null;
  shop: string | null;
  signature: string | null;
  rawBody: string;
};

export type WebhookDecision =
  | { ok: true; topic: WebhookTopic; shop: string }
  | { ok: false; status: number; reason: string };

/**
 * بيقرر نعمل إيه بالطلب ده.
 *
 * **الرفض بيرجع ٤٠١ مش ٤٠٠** — شوبيفاي بتختبر ده في المراجعة: بتبعت طلب
 * بتوقيع غلط ولازم تشوف ٤٠١.
 *
 * **والموضوع اللي مانعرفوش بيرجع ٢٠٠** — شوبيفاي بتعيد المحاولة على أي رد
 * غير ٢٠٠، فالرفض هيخلّيها تفضل تحاول على حاجة إحنا أصلًا مش مهتمين بيها.
 */
export function decideWebhook(
  req: WebhookRequest,
  clientSecret: string
): WebhookDecision {
  if (!verifyWebhook(req.rawBody, req.signature, clientSecret)) {
    return { ok: false, status: 401, reason: "التوقيع مش من شوبيفاي" };
  }

  const shop = String(req.shop ?? "").trim().toLowerCase();
  if (!shop) {
    return { ok: false, status: 401, reason: "الطلب مالوش متجر" };
  }

  const topic = String(req.topic ?? "").trim().toLowerCase();
  if (!HANDLED_TOPICS.includes(topic as WebhookTopic)) {
    return { ok: false, status: 200, reason: "موضوع مش بنرد عليه" };
  }

  return { ok: true, topic: topic as WebhookTopic, shop };
}
