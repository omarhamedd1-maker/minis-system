// ==========================================================================
// ربط شوبيفاي بضغطة واحدة (OAuth)
// --------------------------------------------------------------------------
// تطبيق واحد للمنصة كلها بيتسجّل مرة واحدة في Shopify Partners، وكل بيزنس
// بيربط متجره بضغطة — من غير ما حد يلزق مفاتيح.
//
// الأمان هنا مش رفاهية، فيه حاجتين لازم يتعملوا صح:
//
//   ١. **الـstate**: رقم عشوائي بنبعته لشوبيفاي وبنستناه يرجع زي ما هو.
//      من غيره أي حد يقدر يزوّر لينك رجوع ويربط متجره ببيزنس تاني.
//
//   ٢. **توقيع HMAC**: شوبيفاي بتوقّع كل رد بمفتاح التطبيق السري. من غير
//      التحقق منه، أي حد يقدر يبعت لينا كود مزوّر.
//
// الدوال هنا صافية (مافيش شبكة ولا قاعدة بيانات) عشان تتختبر.
// ==========================================================================

import crypto from "node:crypto";
import { isValidShop, normalizeShop } from "./client";

/** الصلاحيات اللي التطبيق بيطلبها — لازم تطابق اللي في لوحة شوبيفاي */
export const SHOPIFY_SCOPES = [
  "read_products",
  "read_orders",
  "write_orders",
  "write_order_edits",
].join(",");

/** رقم عشوائي للـstate — بنخزّنه ونقارنه لما شوبيفاي ترجّعه */
export function newState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** لينك موافقة شوبيفاي */
export function buildInstallUrl(input: {
  shop: string;
  clientId: string;
  redirectUri: string;
  state: string;
}): string | null {
  const shop = normalizeShop(input.shop);
  if (!isValidShop(shop)) return null;

  const q = new URLSearchParams({
    client_id: input.clientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  return `https://${shop}/admin/oauth/authorize?${q}`;
}

/**
 * بيتأكد إن الرد جاي من شوبيفاي فعلًا.
 *
 * الطريقة: بنشيل `hmac` من الباراميترات، نرتّب الباقي أبجديًا، نعملهم نص
 * `k=v&k=v`، ونوقّعه بالمفتاح السري — لازم يطلع نفس التوقيع.
 *
 * والمقارنة بـ`timingSafeEqual` مش `===` — المقارنة العادية بتخلص بدري لما
 * أول حرف يختلف، وده بيسرّب معلومة عن التوقيع الصح.
 */
export function verifyHmac(
  params: Record<string, string>,
  clientSecret: string
): boolean {
  const { hmac, ...rest } = params;
  if (!hmac || !clientSecret) return false;

  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type CallbackCheck =
  | { ok: true; shop: string; code: string; state: string }
  | { ok: false; error: string };

/** بيفحص رد شوبيفاي قبل ما نلمس أي حاجة */
export function checkCallback(
  params: Record<string, string>,
  clientSecret: string
): CallbackCheck {
  const shop = normalizeShop(params.shop);
  if (!isValidShop(shop)) {
    return { ok: false, error: "دومين المتجر مش مظبوط" };
  }
  if (!params.code) return { ok: false, error: "شوبيفاي مابعتتش كود الربط" };
  if (!params.state) return { ok: false, error: "الرد ناقص — جرّب الربط تاني" };
  if (!verifyHmac(params, clientSecret)) {
    return { ok: false, error: "توقيع شوبيفاي مش مظبوط — الرد ده مش منها" };
  }
  return { ok: true, shop, code: params.code, state: params.state };
}
