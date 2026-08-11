import { describe, expect, it } from "vitest";
import { collectionAging, pendingAmount, type AgingOrder } from "./collection-aging.ts";

const TODAY = "2026-08-11";

function order(over: Partial<AgingOrder> = {}): AgingOrder {
  return {
    order_status: "delivered",
    delivered_at: "2026-08-10",
    cash_received_at: null,
    bosta_collected: false,
    bosta_cod: null,
    discount: 0,
    shipping_price: 0,
    order_items: [{ quantity: 1, sale_price_at_order: 100 }],
    ...over,
  };
}

describe("المبلغ الواقف على الأوردر", () => {
  it("بياخد رقم بوسطة لما يكون موجود", () => {
    // بوسطة بتحصّل ٩٥٠ حتى لو إجمالينا ١٠٠ — تعديل بعد الشحن مثلاً
    expect(pendingAmount(order({ bosta_cod: 950 }))).toBe(950);
  });

  it("**بوسطة مالهاش رقم → صفر، مش إجمالي الأوردر**", () => {
    // COD صفر على أوردر مسلّم معناه إن بوسطة مالهاش دعوة بيه أصلاً.
    // الرجوع للإجمالي هنا كان بيطلّع ١١٠ ألف وهمية على مينيز.
    const o = order({
      bosta_cod: 0,
      order_items: [{ quantity: 2, sale_price_at_order: 300 }],
      shipping_price: 90,
    });
    expect(pendingAmount(o)).toBe(0);
  });
});

describe("فلوس واقفة عند بوسطة", () => {
  it("اللي اتحصّل مابيتحسبش", () => {
    const r = collectionAging(
      [order({ cash_received_at: "2026-08-11", bosta_cod: 500 })],
      TODAY
    );
    expect(r.total).toBe(0);
    expect(r.count).toBe(0);
  });

  it("**بوسطة قايلة حصّلت → مش واقف** — الخانة اللي عندنا مش بتتملا أصلاً", () => {
    const r = collectionAging([order({ bosta_collected: true, bosta_cod: 500 })], TODAY);
    expect(r.total).toBe(0);
  });

  it("اللي لسه ماتسلّمش مابيتحسبش", () => {
    const r = collectionAging(
      [order({ order_status: "out_for_delivery", bosta_cod: 500 })],
      TODAY
    );
    expect(r.total).toBe(0);
  });

  it("**المُسلَّم من غير تاريخ تسليم مابيتحسبش** — مافيش عمر نحسبه", () => {
    const r = collectionAging([order({ delivered_at: null, bosta_cod: 500 })], TODAY);
    expect(r.total).toBe(0);
  });

  it("بيوزّع على الشرايح بعمر التسليم", () => {
    const r = collectionAging(
      [
        order({ delivered_at: "2026-08-09", bosta_cod: 100 }), // يومين
        order({ delivered_at: "2026-08-01", bosta_cod: 200 }), // ١٠ أيام
        order({ delivered_at: "2026-07-20", bosta_cod: 300 }), // ٢٢ يوم
        order({ delivered_at: "2026-06-01", bosta_cod: 400 }), // ٧١ يوم
      ],
      TODAY
    );
    expect(r.buckets.map((b) => b.amount)).toEqual([100, 200, 300, 400]);
    expect(r.buckets.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(r.total).toBe(1000);
    expect(r.count).toBe(4);
  });

  it("حدود الشرايح بالظبط — ٧ و٨ و١٤ و١٥", () => {
    const at = (d: string, amount: number) =>
      order({ delivered_at: d, bosta_cod: amount });
    const r = collectionAging(
      [
        at("2026-08-04", 1), // ٧ أيام → الشريحة الأولى
        at("2026-08-03", 2), // ٨ أيام → التانية
        at("2026-07-28", 4), // ١٤ يوم → التانية
        at("2026-07-27", 8), // ١٥ يوم → التالتة
      ],
      TODAY
    );
    expect(r.buckets[0].amount).toBe(1);
    expect(r.buckets[1].amount).toBe(2 + 4);
    expect(r.buckets[2].amount).toBe(8);
  });

  it("بيقول أقدم أوردر واقف", () => {
    const r = collectionAging(
      [
        order({ delivered_at: "2026-08-09", bosta_cod: 100 }),
        order({ delivered_at: "2026-06-01", bosta_cod: 400 }),
      ],
      TODAY
    );
    expect(r.oldestDays).toBe(71);
  });

  it("الأوردر اللي بوسطة ماشالتوش مابيتحسبش", () => {
    const r = collectionAging([order({ bosta_cod: 0 })], TODAY);
    expect(r.total).toBe(0);
    expect(r.count).toBe(0);
  });

  it("مفيش أوردرات واقفة → أصفار ومفيش أقدم", () => {
    const r = collectionAging([], TODAY);
    expect(r.total).toBe(0);
    expect(r.oldestDays).toBeNull();
    expect(r.buckets).toHaveLength(4);
  });

  it("تاريخ تسليم في المستقبل بيتحسب صفر يوم مش رقم سالب", () => {
    const r = collectionAging(
      [order({ delivered_at: "2026-09-01", bosta_cod: 100 })],
      TODAY
    );
    expect(r.buckets[0].amount).toBe(100);
    expect(r.oldestDays).toBe(0);
  });
});
