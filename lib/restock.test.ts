import { describe, it, expect } from "vitest";
import { planRestock, restockSummary, type RestockOrder } from "./restock";

const order = (o: Partial<RestockOrder> = {}): RestockOrder => ({
  orderStatus: "returned",
  alreadyRestocked: false,
  hadStockMovement: true,
  items: [
    { variantId: "v1", quantity: 2 },
    { variantId: "v2", quantity: 1 },
  ],
  ...o,
});

describe("رجوع المرتجع للمخزن", () => {
  it("الراجع بيترجّع", () => {
    const p = planRestock(order());
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.items).toHaveLength(2);
  });

  it("المرتجع بعد التسليم برضه بيترجّع", () => {
    expect(planRestock(order({ orderStatus: "returned_after_delivery" })).ok).toBe(true);
  });

  it("اللي مارجعش مايترجّعش", () => {
    for (const s of ["delivered", "shipped", "cancelled", "new", "returning"]) {
      const p = planRestock(order({ orderStatus: s }));
      expect(p.ok, s).toBe(false);
    }
  });

  it("⚠️ مرة واحدة بس — الدوسة التانية بترفض", () => {
    const p = planRestock(order({ alreadyRestocked: true }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("خلاص");
  });

  it("⚠️ الأوردر اللي مخصمش مخزون مايرجّعش", () => {
    const p = planRestock(order({ hadStockMovement: false }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("مخصمش");
  });

  it("البنود الفاضية أو بكمية صفر بتتشال", () => {
    const p = planRestock(
      order({
        items: [
          { variantId: null, quantity: 5 },
          { variantId: "v1", quantity: 0 },
          { variantId: "  ", quantity: 3 },
          { variantId: "v2", quantity: 4 },
        ],
      })
    );
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.items).toEqual([{ variantId: "v2", quantity: 4 }]);
  });

  it("مفيش بنود صالحة = مفيش رجوع", () => {
    const p = planRestock(order({ items: [] }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("بنود");
  });

  it("الخلاصة بتجمع القطع مش السطور", () => {
    expect(restockSummary([{ quantity: 2 }, { quantity: 3 }])).toContain("5 قطعة");
  });
});
