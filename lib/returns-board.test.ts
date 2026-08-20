import { describe, it, expect } from "vitest";
import { returnsBoard, returnRate, type ReturnOrder } from "./returns-board";

const o = (x: Partial<ReturnOrder> = {}): ReturnOrder => ({
  id: "1",
  orderNumber: "1142",
  orderStatus: "returned",
  movedAt: "2026-08-18T10:00:00Z",
  reason: "refused",
  customerName: "محمد",
  customerPhone: "01000000000",
  itemsTotal: 1960,
  shippingCost: 88,
  restocked: true,
  hadStockMovement: true,
  ...x,
});

describe("لوحة المرتجعات", () => {
  it("بتجمع الراجع بنوعيه", () => {
    const b = returnsBoard([
      o({ id: "a" }),
      o({ id: "b", orderStatus: "returned_after_delivery" }),
    ]);
    expect(b.count).toBe(2);
    expect(b.afterDelivery).toBe(1);
  });

  it("⚠️⚠️ اللي ماخصمش مخزون أصلًا مش بضاعة ضايعة — حالة تالتة", () => {
    const b = returnsBoard([o({ restocked: false, hadStockMovement: false })]);
    expect(b.notRestocked).toHaveLength(0);
    expect(b.outsideStock).toHaveLength(1);
    expect(b.stuckValue).toBe(0);
    // الخسارة الشحن بس — البضاعة ماكانتش متخصومة عشان تضيع
    expect(b.rows[0].lost).toBe(88);
  });

  it("⚠️ اللي خصم مخزون ومارجعش بضاعته محسوبة ضايعة", () => {
    const b = returnsBoard([o({ restocked: false })]);
    expect(b.notRestocked).toHaveLength(1);
    expect(b.stuckValue).toBe(1960);
    expect(b.rows[0].lost).toBe(88 + 1960);
  });

  it("⚠️ اللي رجع المخزن خسارته الشحن بس", () => {
    const b = returnsBoard([o({ restocked: true })]);
    expect(b.rows[0].lost).toBe(88);
    expect(b.stuckValue).toBe(0);
  });

  it("اللي مش راجع مايدخلش أصلاً", () => {
    const b = returnsBoard([
      o({ orderStatus: "delivered" }),
      o({ orderStatus: "shipped" }),
      o({ orderStatus: null }),
    ]);
    expect(b.count).toBe(0);
    expect(b.shippingBurned).toBe(0);
  });

  it("الشحن المحروق بيتجمع من كل الراجع", () => {
    const b = returnsBoard([o({ id: "a" }), o({ id: "b", shippingCost: 112 })]);
    expect(b.shippingBurned).toBe(200);
  });

  it("الأسباب مرتّبة بالأكتر", () => {
    const b = returnsBoard([
      o({ id: "a", reason: "refused" }),
      o({ id: "b", reason: "changed_mind" }),
      o({ id: "c", reason: "refused" }),
    ]);
    expect(b.byReason[0]).toMatchObject({ reason: "refused", count: 2 });
    expect(b.byReason[0].value).toBe(3920);
  });

  it("⚠️ «السبب مش مكتوب» سبب برضه مش صف مرمي", () => {
    const b = returnsBoard([o({ reason: null }), o({ id: "b", reason: "  " })]);
    expect(b.byReason).toEqual([{ reason: "unknown", count: 2, value: 3920 }]);
  });

  it("الأحدث الأول", () => {
    const b = returnsBoard([
      o({ id: "قديم", movedAt: "2026-08-01T00:00:00Z" }),
      o({ id: "جديد", movedAt: "2026-08-19T00:00:00Z" }),
    ]);
    expect(b.rows.map((r) => r.id)).toEqual(["جديد", "قديم"]);
  });

  it("التاريخ الفاضي مايكسرش الترتيب", () => {
    expect(() => returnsBoard([o({ movedAt: null }), o({ id: "b" })])).not.toThrow();
  });

  it("الأرقام السالبة مابتزوّدش الخسارة", () => {
    const b = returnsBoard([o({ shippingCost: -50, itemsTotal: -10 })]);
    expect(b.rows[0].lost).toBe(0);
    expect(b.shippingBurned).toBe(0);
  });

  it("مافيش مرتجعات = لوحة فاضية من غير قسمة على صفر", () => {
    const b = returnsBoard([]);
    expect(b).toMatchObject({ count: 0, stuckValue: 0, shippingBurned: 0 });
    expect(b.byReason).toEqual([]);
  });

  it("⚠️ نسبة الرجوع من اللي خلص مش من كل الأوردرات", () => {
    expect(returnRate(100, 25)).toBe(25);
    expect(returnRate(49, 13)).toBe(26.5);
  });

  it("⚠️ مافيش أوردرات خلصت = مافيش نسبة، مش صفر", () => {
    expect(returnRate(0, 0)).toBeNull();
  });
});
