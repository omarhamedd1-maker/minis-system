import { describe, expect, it } from "vitest";
import {
  computeHeadline,
  orderCarrierCost,
  shippingSettlement,
  type StatOrder,
} from "./dashboard-stats";

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

describe("الإجمالي بالملغي والمرتجع", () => {
  const item = (qty: number, price: number, cost = 0) => ({
    quantity: qty,
    sale_price_at_order: price,
    cost_price_at_order: cost,
  });
  const order = (over: Partial<StatOrder> = {}): StatOrder => ({
    order_status: "delivered",
    order_date: "2026-08-24T10:00:00Z",
    delivered_at: null,
    discount: 0,
    shipping_price: 0,
    bosta_shipping_cost: null,
    bosta_fees_real: null,
    bosta_cod: null,
    bosta_collected: null,
    order_items: [],
    ...over,
  });
  const empty = { amount: 0 };
  const day = "2026-08-24";

  it("المبيعات بتقفّي الملغي والمرتجع — والإجمالي بيشملهم كلهم", () => {
    const h = computeHeadline(
      [
        order({ order_items: [item(1, 1000)] }),
        order({ order_status: "cancelled", order_items: [item(1, 500)] }),
        order({
          order_status: "returned",
          order_items: [item(1, 300)],
        }),
        order({
          order_status: "returned_after_delivery",
          order_items: [item(2, 100)],
        }),
      ],
      [empty],
      day,
      day
    );
    // المبيعات = المتسلم بس
    expect(h.sales).toBe(1000);
    // الإجمالي = كل حاجة حركت في الفترة: 1000 + 500 + 300 + 200
    expect(h.grossSales).toBe(2000);
    expect(h.orderCount).toBe(1);
  });

  it("الفرق بين الإجمالي والمبيعات = قيمة اللي اتلغى ورجع بالظبط", () => {
    const h = computeHeadline(
      [
        order({ order_items: [item(1, 800)], discount: 50, shipping_price: 40 }),
        order({
          order_status: "cancelled",
          order_items: [item(1, 250)],
          discount: 0,
          shipping_price: 30,
        }),
      ],
      [empty],
      day,
      day
    );
    expect(h.sales).toBe(790); // 800 − 50 + 40
    expect(h.grossSales).toBe(1070); // + 250 − 0 + 30
    expect(h.grossSales - h.sales).toBe(280);
  });

  it("مافيش أوردرات في الفترة؟ الاتنين صفر", () => {
    const h = computeHeadline(
      [order({ order_date: "2026-01-01T10:00:00Z" })],
      [empty],
      day,
      day
    );
    expect(h.sales).toBe(0);
    expect(h.grossSales).toBe(0);
  });

  it("كله سليم؟ الإجمالي يساوي المبيعات", () => {
    const h = computeHeadline(
      [order({ order_items: [item(2, 150)] })],
      [empty],
      day,
      day
    );
    expect(h.sales).toBe(300);
    expect(h.grossSales).toBe(300);
  });
});
