import { describe, expect, it } from "vitest";
import {
  overallAov,
  segmentCustomers,
  statsByCustomer,
  type SegOrder,
} from "./customer-segments.ts";

const TODAY = "2026-08-12";

function ord(over: Partial<SegOrder> = {}): SegOrder {
  return {
    customer_id: "c1",
    order_status: "delivered",
    order_date: "2026-08-10",
    payment_method: "cod",
    amount_paid: 0,
    discount: 0,
    shipping_price: 0,
    order_items: [{ quantity: 1, sale_price_at_order: 500 }],
    ...over,
  };
}

describe("أرقام كل عميل", () => {
  it("بيجمع الأوردرات والفلوس ويحسب المتوسط", () => {
    const s = statsByCustomer(
      [
        ord({ order_items: [{ quantity: 1, sale_price_at_order: 400 }] }),
        ord({ order_items: [{ quantity: 1, sale_price_at_order: 600 }] }),
      ],
      TODAY
    );
    expect(s[0].orders).toBe(2);
    expect(s[0].spend).toBe(1000);
    expect(s[0].aov).toBe(500);
  });

  it("**الملغي مايحسبش عميل**", () => {
    // من غير كده اللي طلب ولغى بيبان زبون
    const s = statsByCustomer([ord({ order_status: "cancelled" })], TODAY);
    expect(s).toHaveLength(0);
  });

  it("الأوردر من غير عميل بيتعدّى", () => {
    expect(statsByCustomer([ord({ customer_id: null })], TODAY)).toHaveLength(0);
  });

  it("بيحسب نسبة الرجوع", () => {
    const s = statsByCustomer(
      [ord(), ord({ order_status: "returned" })],
      TODAY
    );
    expect(s[0].returned).toBe(1);
    expect(s[0].returnRate).toBe(0.5);
  });

  it("المدفوع مقدم: طريقة مش كاش أو دفع جزء", () => {
    const s = statsByCustomer(
      [
        ord({ payment_method: "instapay" }),
        ord({ payment_method: "cod", amount_paid: 200 }),
        ord(),
      ],
      TODAY
    );
    expect(s[0].prepaid).toBe(2);
  });

  it("آخر أوردر وعمره", () => {
    const s = statsByCustomer(
      [ord({ order_date: "2026-05-01" }), ord({ order_date: "2026-08-02" })],
      TODAY
    );
    expect(s[0].lastOrder).toBe("2026-08-02");
    expect(s[0].daysSinceLast).toBe(10);
  });
});

describe("الشرايح", () => {
  const many = (id: string, n: number, price: number, over: Partial<SegOrder> = {}) =>
    Array.from({ length: n }, () =>
      ord({
        customer_id: id,
        order_items: [{ quantity: 1, sale_price_at_order: price }],
        ...over,
      })
    );

  it("الزبون الدايم من ٣ أوردرات", () => {
    const st = statsByCustomer([...many("a", 3, 500), ...many("b", 2, 500)], TODAY);
    const segs = segmentCustomers(st, overallAov(st));
    const loyal = segs.find((s) => s.key === "loyal")!;
    expect(loyal.customers.map((c) => c.customerId)).toEqual(["a"]);
  });

  it("**العميل بيقع في أكتر من شريحة**", () => {
    // بيدفع مقدم وأوردره عالي — مالوش سبب يتشال من واحدة منهم
    const st = statsByCustomer(
      [
        ...many("rich", 1, 5000, { payment_method: "instapay" }),
        ...many("normal", 4, 500),
      ],
      TODAY
    );
    const segs = segmentCustomers(st, overallAov(st));
    const inPrepaid = segs.find((s) => s.key === "prepaid")!.customers;
    const inHigh = segs.find((s) => s.key === "high_aov")!.customers;
    expect(inPrepaid.some((c) => c.customerId === "rich")).toBe(true);
    expect(inHigh.some((c) => c.customerId === "rich")).toBe(true);
  });

  it("اللي رجّع نص أوردراته بيدخل «بيرجّع كتير»", () => {
    const st = statsByCustomer(
      [
        ord({ customer_id: "r" }),
        ord({ customer_id: "r", order_status: "returned" }),
      ],
      TODAY
    );
    const segs = segmentCustomers(st, overallAov(st));
    expect(segs.find((s) => s.key === "returner")!.customers).toHaveLength(1);
  });

  it("أوردر واحد راجع مايدخلش «بيرجّع كتير»", () => {
    // من أوردر واحد مافيش نمط — ده ممكن يكون صدفة
    const st = statsByCustomer([ord({ customer_id: "x", order_status: "returned" })], TODAY);
    const segs = segmentCustomers(st, overallAov(st));
    expect(segs.find((s) => s.key === "returner")!.customers).toHaveLength(0);
  });

  it("الغايب من ٩٠ يوم فأكتر", () => {
    const st = statsByCustomer(
      [
        ord({ customer_id: "old", order_date: "2026-01-01" }),
        ord({ customer_id: "now", order_date: "2026-08-11" }),
      ],
      TODAY
    );
    const segs = segmentCustomers(st, overallAov(st));
    expect(
      segs.find((s) => s.key === "dormant")!.customers.map((c) => c.customerId)
    ).toEqual(["old"]);
  });

  it("بيرتّب بالأكتر إنفاق وبيجمع قيمة الشريحة", () => {
    const st = statsByCustomer(
      [...many("small", 1, 100), ...many("big", 1, 900)],
      TODAY
    );
    const segs = segmentCustomers(st, overallAov(st));
    const neu = segs.find((s) => s.key === "new")!;
    expect(neu.customers[0].customerId).toBe("big");
    expect(neu.spend).toBe(1000);
  });

  it("مفيش عملاء → شرايح فاضية من غير قسمة على صفر", () => {
    const segs = segmentCustomers([], 0);
    expect(segs).toHaveLength(6);
    expect(segs.every((s) => s.customers.length === 0)).toBe(true);
    expect(overallAov([])).toBe(0);
  });
});
