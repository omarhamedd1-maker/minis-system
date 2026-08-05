import { describe, expect, it } from "vitest";
import { orderCarrierCost, shippingSettlement } from "./dashboard-stats";

describe("تكلفة بوسطة: الحقيقي بيكسب على التقدير", () => {
  it("موجود الرقم الحقيقي؟ ياخده", () => {
    // أوردر ١٠٧٤: تقديرنا ٣٧٫٦٢ والحقيقي ١٣٥٫٦٦ لأن الباقة ماغطّتش شحنه
    expect(
      orderCarrierCost({ bosta_shipping_cost: 37.62, bosta_fees_real: 135.66 })
    ).toBe(135.66);
  });

  it("مش موجود؟ يرجع للتقدير — الشحنة لسه شغالة", () => {
    expect(
      orderCarrierCost({ bosta_shipping_cost: 30.78, bosta_fees_real: null })
    ).toBe(30.78);
    expect(orderCarrierCost({ bosta_shipping_cost: 30.78 })).toBe(30.78);
  });

  it("صفر أو ناقص = مفيش تكلفة", () => {
    expect(orderCarrierCost({ bosta_shipping_cost: null })).toBe(0);
    expect(
      orderCarrierCost({ bosta_shipping_cost: null, bosta_fees_real: 0 })
    ).toBe(0);
  });
});

describe("تسوية الشحن: كلّف كام والعميل دفع كام", () => {
  // الحالة اللي كشفت الباج — صورة من تليفون عمر ٦ أغسطس ٢٠٢٦.
  // شحن ٩٣ الباقة غطّته، فبوسطة خدت ٣٤٫٢ بس. الصفحة كانت بتطرح ٨٨ تاني
  // وتقول «بترجع لك ١٤٣٫٨».
  it("الباقة غطّت الشحن: الحقيقي بعد الخصم، ومفيش طرح تاني للـ٨٨", () => {
    const s = shippingSettlement({
      feesReal: 34.2,
      feesEstimate: 30.78,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(s.cost).toBe(34.2);
    expect(s.paidByCustomer).toBe(90);
    expect(s.net).toBe(-55.8); // زيادة معاك، مش ١٤٣٫٨
    expect(s.real).toBe(true);
  });

  // أوردر ١٠٧٤: الباقة ماغطّتش شحنه فبوسطة خدت ١٣٥٫٦٦ كاملة.
  // الطرح القديم كان بيخترع ٨٨ محدش دفعها ويقلب الخسارة لمكسب.
  it("الباقة ماغطّتش: كل الرسوم عليك", () => {
    const s = shippingSettlement({
      feesReal: 135.66,
      feesEstimate: 37.62,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(s.cost).toBe(135.66);
    expect(s.net).toBe(45.66); // عليك، مش «بترجع لك ٤٢٫٣٤»
  });

  it("العميل ماستلمش: مافيش شحن اتحصّل، الرسوم كلها عليك", () => {
    const s = shippingSettlement({
      feesReal: 19.38,
      feesEstimate: 22.78,
      shippingPrice: 90,
      customerReceived: false,
    });
    expect(s.paidByCustomer).toBe(0);
    expect(s.net).toBe(19.38);
  });

  it("مفيش رقم حقيقي؟ التقدير — وبيتعلّم إنه تقدير", () => {
    const s = shippingSettlement({
      feesReal: null,
      feesEstimate: 30.78,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(s.cost).toBe(30.78);
    expect(s.net).toBe(-59.22);
    expect(s.real).toBe(false);
  });

  it("التعادل بيرجع صفر مش رقم صغير سالب", () => {
    const s = shippingSettlement({
      feesReal: 90,
      feesEstimate: null,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(s.net).toBe(0);
  });
});
