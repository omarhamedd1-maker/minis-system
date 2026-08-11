import { describe, expect, it } from "vitest";
import { carrierRates, leadTime, type OpsOrder } from "./ops-metrics.ts";

function o(over: Partial<OpsOrder> = {}): OpsOrder {
  return {
    order_status: "delivered",
    order_date: "2026-08-01",
    delivered_at: "2026-08-04",
    bosta_tracking: "30000001",
    bosta_created_at: "2026-08-02",
    bosta_cod: 500,
    discount: 0,
    shipping_price: 0,
    order_items: [{ quantity: 1, sale_price_at_order: 500 }],
    ...over,
  };
}

describe("نِسَب الشحن", () => {
  it("**الأوردر اللي ماعدّاش على بوسطة مايتحسبش خالص**", () => {
    // دي الغلطة اللي وقعنا فيها في حساب الفلوس الواقفة: ٣٥ أوردر مسلّم
    // ماعدّوش على بوسطة كانوا بيلخبطوا كل رقم
    const r = carrierRates([
      o({ bosta_tracking: null }),
      o({ bosta_tracking: null, order_status: "returned" }),
    ]);
    expect(r.shipped).toBe(0);
    expect(r.deliveryRate).toBe(0);
    expect(r.rtoRate).toBe(0);
  });

  it("المقام هو اللي اتشحن مش كل الأوردرات", () => {
    const r = carrierRates([
      o(),
      o(),
      o({ order_status: "returned" }),
      // جديد لسه ماخرجش — مالوش رقم تتبع فمش المفروض يقلّل النسبة
      o({ order_status: "new", bosta_tracking: null, delivered_at: null }),
    ]);
    expect(r.shipped).toBe(3);
    expect(r.deliveryRate).toBe(67);
    expect(r.rtoRate).toBe(33);
  });

  it("المرتجع بعد التسليم بيتحسب في نسبة الرجوع", () => {
    const r = carrierRates([
      o(),
      o({ order_status: "returned_after_delivery" }),
    ]);
    expect(r.returnedAfter).toBe(1);
    expect(r.rtoRate).toBe(50);
  });

  it("بيجمع فلوس البضاعة الراجعة", () => {
    const r = carrierRates([
      o({
        order_status: "returned",
        order_items: [{ quantity: 2, sale_price_at_order: 300 }],
        discount: 50,
        shipping_price: 90,
      }),
    ]);
    expect(r.returnedValue).toBe(2 * 300 - 50 + 90);
  });

  it("مفيش شحنات → أصفار مش قسمة على صفر", () => {
    const r = carrierRates([]);
    expect(r.deliveryRate).toBe(0);
    expect(r.rtoRate).toBe(0);
    expect(Number.isNaN(r.deliveryRate)).toBe(false);
  });
});

describe("زمن التوصيل", () => {
  it("بيحسب المتوسط والوسيط", () => {
    const r = leadTime([
      o({ order_date: "2026-08-01", bosta_created_at: "2026-08-01", delivered_at: "2026-08-03" }), // ٢
      o({ order_date: "2026-08-01", bosta_created_at: "2026-08-01", delivered_at: "2026-08-05" }), // ٤
      o({ order_date: "2026-08-01", bosta_created_at: "2026-08-01", delivered_at: "2026-08-07" }), // ٦
    ]);
    expect(r.average).toBe(4);
    expect(r.median).toBe(4);
    expect(r.count).toBe(3);
    expect(r.slowest).toBe(6);
  });

  it("**شحنة واحدة متأخرة بتكدّب المتوسط والوسيط بيفضحها**", () => {
    const r = leadTime([
      o({ order_date: "2026-08-01", bosta_created_at: "2026-08-01", delivered_at: "2026-08-03" }), // ٢
      o({ order_date: "2026-08-01", bosta_created_at: "2026-08-01", delivered_at: "2026-08-03" }), // ٢
      o({ order_date: "2026-08-01", bosta_created_at: "2026-08-01", delivered_at: "2026-08-03" }), // ٢
      o({ order_date: "2026-06-01", bosta_created_at: "2026-06-02", delivered_at: "2026-08-01" }), // ٦١
    ]);
    expect(r.average).toBe(16.8); // المتوسط بيقول ١٧ يوم
    expect(r.median).toBe(2); // والوسيط بيقول يومين — ودي الحقيقة
  });

  it("**التسليم نفس يوم الشحنة بيتشال** — ده نقل قديم مش توصيل سريع", () => {
    const r = leadTime([
      o({ order_date: "2026-03-08", bosta_created_at: "2026-03-08", delivered_at: "2026-03-08" }),
      o({ order_date: "2026-08-01", bosta_created_at: "2026-08-02", delivered_at: "2026-08-05" }),
    ]);
    expect(r.count).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.median).toBe(4);
  });

  it("اللي ماتسلّمش مايدخلش", () => {
    const r = leadTime([o({ order_status: "returned" }), o()]);
    expect(r.count).toBe(1);
  });

  it("المسلَّم من غير تاريخ تسليم مايدخلش", () => {
    const r = leadTime([o({ delivered_at: null })]);
    expect(r.count).toBe(0);
    expect(r.average).toBeNull();
  });

  it("مفيش تسليمات → فاضي مش صفر", () => {
    const r = leadTime([]);
    expect(r.average).toBeNull();
    expect(r.median).toBeNull();
    expect(r.slowest).toBeNull();
  });
});
