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
  // شحن ٩٣ الباقة غطّته، فبوسطة خصمت ٣٤٫٢ بس. الصفحة كانت بتطرح ٨٨ تاني
  // وتقول «بترجع لك ١٤٣٫٨».
  it("الباقة غطّت: الخصم ٣٤٫٢ ونصيب الباقة ٩٣ جوّه الصورة الكاملة", () => {
    const s = shippingSettlement({
      feesReal: 34.2,
      feesEstimate: 30.78,
      shipFeeReal: 93,
      bundleCovered: true,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(s.cost).toBe(34.2); // الكاش اللي خرج — ده اللي الأرباح بتشوفه
    expect(s.bundleShare).toBe(93);
    expect(s.full).toBe(127.2);
    expect(s.net).toBe(37.2); // الشحن عليك، مش «بترجع لك ١٤٣٫٨»
    expect(s.real).toBe(true);
  });

  // أوردر ١٠٧٤: الباقة ماغطّتش شحنه فبوسطة خصمت ١٣٥٫٦٦ كاملة.
  // **نصيب الباقة صفر هنا** — الشحن جوّه الرقم خلاص، وجمعه تاني بيحسبه مرتين.
  it("الباقة ماغطّتش: نصيبها صفر لأن الشحن جوّه الخصم", () => {
    const s = shippingSettlement({
      feesReal: 135.66,
      feesEstimate: 37.62,
      shipFeeReal: 113,
      bundleCovered: false,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(s.bundleShare).toBe(0);
    expect(s.full).toBe(135.66);
    expect(s.net).toBe(45.66);
  });

  // **ده بيت القصيد**: الاتنين فوق بقوا بيتقارنوا — ١٢٧٫٢ و١٣٥٫٦٦ —
  // بدل ٣٤٫٢ و١٣٥٫٦٦ اللي كانت بتخلّي شحنة تبان أرخص بمية جنيه
  it("الشحنتين بقوا في نفس المدى بعد ما نصيب الباقة اتحسب", () => {
    const covered = shippingSettlement({
      feesReal: 34.2,
      feesEstimate: null,
      shipFeeReal: 93,
      bundleCovered: true,
      shippingPrice: 90,
      customerReceived: true,
    });
    const notCovered = shippingSettlement({
      feesReal: 135.66,
      feesEstimate: null,
      shipFeeReal: 113,
      bundleCovered: false,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(Math.abs(covered.full - notCovered.full)).toBeLessThan(15);
  });

  it("العميل ماستلمش: مافيش شحن اتحصّل، التكلفة كلها عليك", () => {
    const s = shippingSettlement({
      feesReal: 19.38,
      feesEstimate: 22.78,
      shipFeeReal: 93,
      bundleCovered: true,
      shippingPrice: 90,
      customerReceived: false,
    });
    expect(s.paidByCustomer).toBe(0);
    expect(s.net).toBe(112.38);
  });

  it("مفيش رقم حقيقي؟ التقدير — وبيتعلّم إنه تقدير", () => {
    const s = shippingSettlement({
      feesReal: null,
      feesEstimate: 30.78,
      shipFeeReal: null,
      bundleCovered: false,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(s.cost).toBe(30.78);
    expect(s.full).toBe(30.78);
    expect(s.net).toBe(-59.22);
    expect(s.real).toBe(false);
  });

  it("التعادل بيرجع صفر مش رقم صغير سالب", () => {
    const s = shippingSettlement({
      feesReal: 90,
      feesEstimate: null,
      shipFeeReal: null,
      bundleCovered: false,
      shippingPrice: 90,
      customerReceived: true,
    });
    expect(s.net).toBe(0);
  });
});
