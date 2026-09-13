// ==========================================================================
// التأكد إن اللي رنّ فعلًا ميتا
// --------------------------------------------------------------------------
// ⚠️⚠️ **الحساب لازم يتعمل على الجسم الخام زي ما وصل بالحرف.**
// `JSON.stringify(await req.json())` **مش** نفس النص اللي ميتا وقّعت عليه —
// المسافات وترتيب المفاتيح والحروف المهرّبة بتتغيّر، والتوقيع بيفشل دايمًا
// والسبب بيبان كأنه مفتاح غلط.
//
// **الملف ده صافي** — نص وسرّ وتوقيع داخل، صح أو غلط خارج.
// ==========================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export function signBody(rawBody: string, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

/**
 * التوقيع صح؟
 *
 * ⚠️ **المقارنة بوقت ثابت** — المقارنة العادية بترجّع أسرع لما أول حرف
 * يختلف، والفرق ده لوحده بيسمح بتخمين التوقيع حرف حرف.
 */
export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string | null | undefined
): boolean {
  const secret = String(appSecret ?? "").trim();
  const got = String(header ?? "").trim();
  if (!secret || !got) return false;

  const want = signBody(rawBody, secret);
  const a = Buffer.from(want, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
