import { describe, it, expect } from "vitest";
import {
  priceOutcome,
  safeDiscount,
  safeDiscountPercent,
  type PriceInput,
} from "./discount-calculator";

const base: PriceInput = {
  price: 590,
  cost: 205,
  shippingCharged: 90,
  shippingCost: 88,
  returnRate: 0,
};

describe("ربح السعر", () => {
  it("من غير رجوع: السعر والشحن ناقص التكلفة والشحن", () => {
    const r = priceOutcome(base);
    // 590 + 90 − 205 − 88
    expect(r.profitIfDelivered).toBe(387);
    expect(r.expected).toBe(387);
  });

  it("⚠️ نسبة الرجوع بتاكل من الربح المتوقع", () => {
    const r = priceOutcome({ ...base, returnRate: 0.18 });
    // 0.82 × 387 − 0.18 × 88
    expect(r.expected).toBeCloseTo(301.5, 1);
    expect(r.profitIfDelivered).toBe(387);
  });

  it("الخصم بينزل الربح", () => {
    expect(priceOutcome(base, 100).profitIfDelivered).toBe(287);
  });

  it("الخصم الأكبر من السعر مابينزلش تحت الصفر", () => {
    const r = priceOutcome(base, 10_000);
    expect(r.profitIfDelivered).toBe(90 - 205 - 88);
  });

  it("الأرقام السالبة أو الغلط مابتوقعش الحساب", () => {
    expect(() =>
      priceOutcome({
        price: Number.NaN,
        cost: -5,
        shippingCharged: -1,
        shippingCost: Number.NaN,
        returnRate: 5,
      })
    ).not.toThrow();
  });
});

describe("أكبر خصم آمن", () => {
  it("من غير رجوع = كل الربح", () => {
    expect(safeDiscount(base)).toBe(387);
  });

  it("⚠️ مع الرجوع الخصم الآمن أقل", () => {
    const withReturns = safeDiscount({ ...base, returnRate: 0.18 });
    expect(withReturns).toBeLessThan(387);
    expect(withReturns).toBeGreaterThan(0);
  });

  it("⚠️ السعر اللي بيخسر أصلًا = مفيش خصم", () => {
    expect(safeDiscount({ ...base, cost: 900 })).toBe(0);
  });

  it("الخصم مايزيدش عن السعر نفسه", () => {
    expect(safeDiscount({ ...base, cost: 0, shippingCost: 0 })).toBeLessThanOrEqual(
      base.price
    );
  });

  it("النسبة المئوية متسقة مع الجنيهات", () => {
    const pct = safeDiscountPercent(base);
    expect(pct).toBe(Math.floor((387 / 590) * 100));
  });

  it("السعر صفر = مفيش نسبة ومفيش قسمة على صفر", () => {
    expect(safeDiscountPercent({ ...base, price: 0 })).toBe(0);
  });

  it("⚠️ كل الشحنات بترجع = مفيش خصم آمن خالص", () => {
    expect(safeDiscount({ ...base, returnRate: 1 })).toBe(0);
  });
});
