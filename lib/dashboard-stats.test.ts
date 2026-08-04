import { describe, expect, it } from "vitest";
import { orderCarrierCost } from "./dashboard-stats";

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
