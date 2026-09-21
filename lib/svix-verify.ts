/**
 * ==========================================================================
 * توقيع الويب هوك (Svix — اللي Resend بتستعمله) · TRANSFERS §٤ الطبقة ٦
 * --------------------------------------------------------------------------
 * ⚠️ **ده تحقق من إن الطلب من Resend فعلًا**، مش من إن الإيميل من بوسطة.
 * التاني توقيع `bosta.co` (DKIM). الاتنين لازمين:
 *   - من غير ده، أي حد يعرف رابط المسار يقدر يبعت لنا «إيميل» مخترع.
 *   - ومن غير DKIM، Resend بتوصّل أي إيميل حتى لو المرسل مزوّر.
 *
 * **الطريقة (موثّقة عند Svix):** التوقيع = HMAC-SHA256 على النص
 * `<id>.<timestamp>.<الجسم الخام>` بالمفتاح اللي بعد `whsec_` (base64).
 *
 * ⚠️ **الجسم الخام مش المتحوّل لـJSON وراجع** — أي مسافة بتغيّر التوقيع.
 *
 * ⚠️ **والوقت بيتقاس** — من غيره اللي يمسك طلب سليم يقدر يعيد إرساله
 * بعد شهر ويعدّي (replay).
 *
 * ⚠️ **والمقارنة بتاخد نفس الوقت مهما كان الفرق** (`timingSafeEqual`) —
 * المقارنة العادية بتسرّب التوقيع حرف حرف.
 *
 * **الملف ده صافي** — بياخد النص والترويسات ويرجّع حكم.
 * ==========================================================================
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** أقصى فرق بين وقت الطلب ووقتنا — بالثواني */
export const SVIX_TOLERANCE = 5 * 60;

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type SvixResult = { ok: true } | { ok: false; reason: string };

/** التوقيع المتوقع لرسالة — base64 من غير البادئة `v1,` */
export function svixSign(
  secret: string,
  id: string,
  timestamp: string,
  payload: string
): string {
  // المفتاح بيتخزّن `whsec_<base64>` — والجزء اللي بيوقّع بيه هو الـbase64
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(raw, "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * الطلب ده من Resend فعلًا؟
 *
 * `nowSeconds` بيتبعت عشان الاختبار يبقى ثابت مش متعلق بالساعة.
 */
export function verifySvix({
  payload,
  headers,
  secret,
  nowSeconds,
  tolerance = SVIX_TOLERANCE,
}: {
  payload: string;
  headers: SvixHeaders;
  secret: string;
  nowSeconds: number;
  tolerance?: number;
}): SvixResult {
  if (!secret) return { ok: false, reason: "مفيش مفتاح توقيع" };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "ترويسات التوقيع ناقصة" };
  }

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "وقت الطلب مش رقم" };
  if (Math.abs(nowSeconds - sent) > tolerance) {
    return { ok: false, reason: "الطلب قديم أو من المستقبل" };
  }

  const expected = svixSign(secret, id, timestamp, payload);
  // ⚠️ الترويسة ممكن تحمل أكتر من توقيع بمسافات (تدوير المفاتيح) — واحد يكفي
  const parts = signature.split(" ").filter(Boolean);
  for (const part of parts) {
    const value = part.startsWith("v1,") ? part.slice(3) : part;
    if (same(value, expected)) return { ok: true };
  }
  return { ok: false, reason: "التوقيع مش مطابق" };
}
