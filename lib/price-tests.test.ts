import { describe, it, expect } from "vitest";
import { priceTests, MIN_ORDERS_PER_PRICE, type PriceOrder } from "./price-tests";

/** أوردرات بنفس السعر موزّعة على أيام متتالية */
function sales(opts: {
  price: number;
  count: number;
  startDay: number;
  status?: string;
  qty?: number;
}): PriceOrder[] {
  const out: PriceOrder[] = [];
  for (let i = 0; i < opts.count; i++) {
    const d = new Date(Date.UTC(2026, 0, opts.startDay + i));
    out.push({
      orderDate: d.toISOString(),
      orderStatus: opts.status ?? "delivered",
      items: [
        { variantId: "v1", productName: "مقبض", quantity: opts.qty ?? 1, price: opts.price },
      ],
    });
  }
  return out;
}

describe("تجربة السعر", () => {
  it("بيقارن بالفلوس في اليوم مش بالإجمالي", () => {
    // ٤٩٩: ١٠ بيعات على ٦٠ يوم — إجمالي أكبر، بس في اليوم أقل
    const old: PriceOrder[] = [];
    for (let i = 0; i < 10; i++) {
      old.push(...sales({ price: 499, count: 1, startDay: 1 + i * 6 }));
    }
    // ٥٩٩: ١٠ بيعات على ١٠ أيام
    const now = sales({ price: 599, count: 10, startDay: 100 });

    const [t] = priceTests([...old, ...now]);
    expect(t.winner).toBe("high");
    expect(t.low.price).toBe(499);
    expect(t.high.price).toBe(599);
    expect(t.gainPercent).toBeGreaterThan(100);
  });

  it("السعر اللي اتباع مرات قليلة مايتقارنش", () => {
    const many = sales({ price: 400, count: 10, startDay: 1 });
    const few = sales({ price: 600, count: MIN_ORDERS_PER_PRICE - 1, startDay: 40 });
    expect(priceTests([...many, ...few])).toEqual([]);
  });

  it("السعر اللي عاش أيام قليلة مايتقارنش", () => {
    const long = sales({ price: 400, count: 10, startDay: 1 });
    // ١٠ بيعات كلهم في نفس اليوم
    const burst: PriceOrder[] = Array.from({ length: 10 }, () => ({
      orderDate: "2026-03-01T09:00:00Z",
      orderStatus: "delivered",
      items: [{ variantId: "v1", productName: "مقبض", quantity: 1, price: 600 }],
    }));
    expect(priceTests([...long, ...burst])).toEqual([]);
  });

  it("فرق الجنيهات الصغير مش تغيير سعر", () => {
    const a = sales({ price: 500, count: 10, startDay: 1 });
    const b = sales({ price: 502, count: 10, startDay: 60 });
    expect(priceTests([...a, ...b])).toEqual([]);
  });

  it("الملغي مايتحسبش بيعة", () => {
    const good = sales({ price: 400, count: 10, startDay: 1 });
    const dead = sales({ price: 600, count: 10, startDay: 40, status: "cancelled" });
    expect(priceTests([...good, ...dead])).toEqual([]);
  });

  it("الرجوع بيتسجّل مع السعر", () => {
    const cheap = [
      ...sales({ price: 400, count: 6, startDay: 1 }),
      ...sales({ price: 400, count: 4, startDay: 8, status: "returned" }),
    ];
    const dear = sales({ price: 600, count: 10, startDay: 40 });
    const [t] = priceTests([...cheap, ...dear]);
    expect(t.low.returnedOrders).toBe(4);
    expect(Math.round(t.low.returnRate)).toBe(40);
    expect(t.high.returnRate).toBe(0);
  });

  it("السعرين في نفس الوقت = خصم، وبيترفع عليه علم", () => {
    const a = sales({ price: 400, count: 10, startDay: 1 });
    const b = sales({ price: 600, count: 10, startDay: 1 });
    const [t] = priceTests([...a, ...b]);
    expect(t.overlapped).toBe(true);
  });

  it("فترتين ورا بعض مش متداخلين", () => {
    const a = sales({ price: 400, count: 10, startDay: 1 });
    const b = sales({ price: 600, count: 10, startDay: 40 });
    const [t] = priceTests([...a, ...b]);
    expect(t.overlapped).toBe(false);
  });

  it("البند من غير شكل أو بكمية صفر بيتشال", () => {
    const junk: PriceOrder[] = [
      {
        orderDate: "2026-01-01T00:00:00Z",
        orderStatus: "delivered",
        items: [
          { variantId: null, quantity: 5, price: 400 },
          { variantId: "v1", quantity: 0, price: 400 },
          { variantId: "v1", quantity: 1, price: 0 },
        ],
      },
    ];
    expect(priceTests(junk)).toEqual([]);
  });

  it("التاريخ الغلط بيتشال من غير ما يوقع الحساب", () => {
    const bad: PriceOrder[] = [
      { orderDate: "مش تاريخ", orderStatus: "delivered", items: [{ variantId: "v1", quantity: 1, price: 400 }] },
      { orderDate: null, orderStatus: "delivered", items: [{ variantId: "v1", quantity: 1, price: 400 }] },
    ];
    expect(priceTests(bad)).toEqual([]);
  });

  it("أشهر سعرين هما اللي بيتقارنوا مش أعلى وأقل", () => {
    const main = sales({ price: 400, count: 12, startDay: 1 });
    const other = sales({ price: 600, count: 10, startDay: 40 });
    const weird = sales({ price: 900, count: 6, startDay: 80 });
    const [t] = priceTests([...main, ...other, ...weird]);
    expect([t.low.price, t.high.price]).toEqual([400, 600]);
  });
});

describe("الباكِت مش سعر", () => {
  it("السعر اللي هو ضعف سعر تاني بيتشال", () => {
    const one = sales({ price: 649, count: 10, startDay: 1 });
    const pack = sales({ price: 1298, count: 10, startDay: 40 });
    expect(priceTests([...one, ...pack])).toEqual([]);
  });

  it("التلات أضعاف كمان", () => {
    const one = sales({ price: 200, count: 10, startDay: 1 });
    const pack = sales({ price: 600, count: 10, startDay: 40 });
    expect(priceTests([...one, ...pack])).toEqual([]);
  });

  it("سعر قريب من الضعف بس مش هو بيفضل مقارنة", () => {
    const one = sales({ price: 500, count: 10, startDay: 1 });
    const other = sales({ price: 750, count: 10, startDay: 40 });
    expect(priceTests([...one, ...other])).toHaveLength(1);
  });
});
