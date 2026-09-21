import { describe, expect, it } from "vitest";
import { svixSign, verifySvix } from "./svix-verify";

/**
 * ⚠️ **الأرقام دي مش من عندنا** — دي حالة الاختبار المنشورة في دوكس Svix
 * (واللي Resend بتعرضها في صفحة التحقق). لو حسبناها بالدالة نفسها كان
 * الاختبار هيأكد إن الدالة بتساوي نفسها وبس.
 */
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TS = "1614265330";
const PAYLOAD = '{"test": 2432232314}';
const SIGNATURE = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";

const now = Number(TS);

describe("توقيع Svix", () => {
  it("بيطلع نفس التوقيع المنشور", () => {
    expect("v1," + svixSign(SECRET, ID, TS, PAYLOAD)).toBe(SIGNATURE);
  });

  it("بيقبل الطلب السليم", () => {
    const r = verifySvix({
      payload: PAYLOAD,
      headers: { id: ID, timestamp: TS, signature: SIGNATURE },
      secret: SECRET,
      nowSeconds: now,
    });
    expect(r.ok).toBe(true);
  });

  it("⚠️ أي تغيير في الجسم بيكسر التوقيع", () => {
    const r = verifySvix({
      payload: PAYLOAD + " ",
      headers: { id: ID, timestamp: TS, signature: SIGNATURE },
      secret: SECRET,
      nowSeconds: now,
    });
    expect(r).toEqual({ ok: false, reason: "التوقيع مش مطابق" });
  });

  it("⚠️ الطلب القديم بيترفض حتى لو توقيعه سليم — ده منع الإعادة", () => {
    const r = verifySvix({
      payload: PAYLOAD,
      headers: { id: ID, timestamp: TS, signature: SIGNATURE },
      secret: SECRET,
      nowSeconds: now + 60 * 60,
    });
    expect(r).toEqual({ ok: false, reason: "الطلب قديم أو من المستقبل" });
  });

  it("بيقبل لو الترويسة فيها أكتر من توقيع", () => {
    const r = verifySvix({
      payload: PAYLOAD,
      headers: {
        id: ID,
        timestamp: TS,
        signature: "v1,ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ= " + SIGNATURE,
      },
      secret: SECRET,
      nowSeconds: now,
    });
    expect(r.ok).toBe(true);
  });

  it("الترويسات الناقصة بترفض", () => {
    const r = verifySvix({
      payload: PAYLOAD,
      headers: { id: null, timestamp: TS, signature: SIGNATURE },
      secret: SECRET,
      nowSeconds: now,
    });
    expect(r).toEqual({ ok: false, reason: "ترويسات التوقيع ناقصة" });
  });

  it("المفتاح الغلط بيرفض", () => {
    const r = verifySvix({
      payload: PAYLOAD,
      headers: { id: ID, timestamp: TS, signature: SIGNATURE },
      secret: "whsec_" + Buffer.from("مفتاح تاني").toString("base64"),
      nowSeconds: now,
    });
    expect(r.ok).toBe(false);
  });
});
