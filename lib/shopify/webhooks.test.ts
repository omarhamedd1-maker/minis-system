import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  HANDLED_TOPICS,
  decideWebhook,
  verifyWebhook,
  type WebhookRequest,
} from "./webhooks";

const SECRET = "shpss_test_secret";
const BODY = JSON.stringify({ shop_id: 1, shop_domain: "x.myshopify.com" });

const sign = (body: string, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");

// **`in` مش `??`** — الاختبار بيبعت `null` بقصد، و`??` كانت بترجّعه
// للقيمة الافتراضية فالفحص كان بيعدّي وهو مش بيفحص حاجة
const req = (o: Partial<WebhookRequest> = {}): WebhookRequest => ({
  topic: "topic" in o ? o.topic! : "shop/redact",
  shop: "shop" in o ? o.shop! : "x.myshopify.com",
  rawBody: o.rawBody ?? BODY,
  signature: "signature" in o ? o.signature! : sign(o.rawBody ?? BODY),
});

describe("توقيع الويب هوك", () => {
  it("التوقيع الصح بيعدّي", () => {
    expect(verifyWebhook(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("سر مختلف بيترفض", () => {
    expect(verifyWebhook(BODY, sign(BODY, "سر تاني"), SECRET)).toBe(false);
  });

  // **أي تعديل في النص بيكسر التوقيع** — عشان كده المسار بيقرا الجسم الخام
  // مش JSON متفكوك ومتعاد بناؤه
  it("مسافة واحدة زيادة بتكسره", () => {
    expect(verifyWebhook(BODY + " ", sign(BODY), SECRET)).toBe(false);
  });

  it("الفاضي بيترفض", () => {
    expect(verifyWebhook(BODY, null, SECRET)).toBe(false);
    expect(verifyWebhook(BODY, sign(BODY), "")).toBe(false);
  });

  // الطولين لازم يتقارنوا الأول — `timingSafeEqual` بترمي استثناء لو اختلفوا
  it("توقيع قصير مابيرميش استثناء", () => {
    expect(() => verifyWebhook(BODY, "قصير", SECRET)).not.toThrow();
    expect(verifyWebhook(BODY, "قصير", SECRET)).toBe(false);
  });
});

describe("القرار", () => {
  it("الطلب السليم بيعدّي", () => {
    const d = decideWebhook(req(), SECRET);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.topic).toBe("shop/redact");
  });

  // **شوبيفاي بتختبر ده في المراجعة**: بتبعت توقيع غلط ولازم تشوف ٤٠١
  it("التوقيع الغلط بيرجع ٤٠١ مش ٤٠٠", () => {
    const d = decideWebhook(req({ signature: "غلط" }), SECRET);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(401);
  });

  it("طلب من غير متجر بيترفض", () => {
    const d = decideWebhook(req({ shop: null }), SECRET);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(401);
  });

  // **٢٠٠ مش رفض** — شوبيفاي بتعيد المحاولة على أي رد غير ٢٠٠، فالرفض
  // هيخلّيها تفضل تحاول على حاجة إحنا مش مهتمين بيها
  it("موضوع مش بنرد عليه بيرجع ٢٠٠", () => {
    const d = decideWebhook(req({ topic: "orders/create" }), SECRET);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(200);
  });

  it("الموضوعات التلاتة الإجبارية موجودة", () => {
    for (const t of ["customers/data_request", "customers/redact", "shop/redact"]) {
      expect(HANDLED_TOPICS).toContain(t);
    }
  });

  it("الحروف الكبيرة والمسافات مابتكسرش المطابقة", () => {
    const d = decideWebhook(req({ topic: "  SHOP/REDACT  " }), SECRET);
    expect(d.ok).toBe(true);
  });
});
