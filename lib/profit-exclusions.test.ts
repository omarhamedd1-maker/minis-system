import { describe, expect, it } from "vitest";
import { closedCategory, countsInProfit, splitExpenses } from "./profit-exclusions";
import { computeHeadline } from "./dashboard-stats";
import { EXPENSE_CATEGORIES } from "./format";

describe("مصاريف مابتدخلش في الربح", () => {
  it("الخامات والباقة والسحوبات برّه · الباقي جوّه", () => {
    expect(countsInProfit("تصنيع وخامات")).toBe(false);
    expect(countsInProfit("باقة بوسطة")).toBe(false);
    expect(countsInProfit("سحوبات")).toBe(false);
    expect(countsInProfit("إعلانات")).toBe(true);
    expect(countsInProfit("شحن")).toBe(true);
    expect(countsInProfit(" سحوبات ")).toBe(false);
    expect(countsInProfit(null)).toBe(true);
  });

  it("المجموعين", () => {
    expect(
      splitExpenses([
        { amount: 1000, category: "إعلانات" },
        { amount: 500, category: "تصنيع وخامات" },
        { amount: 200, category: "سحوبات" },
        { amount: 50 },
      ])
    ).toEqual({ counted: 1050, excluded: 700 });
  });

  it("التصنيفات المستثناة موجودة في القايمة — عشان التسجيل الجديد يروح مكانه", () => {
    expect(EXPENSE_CATEGORIES).toContain("باقة بوسطة");
    expect(EXPENSE_CATEGORIES).toContain("سحوبات");
  });
});

describe("⚠️ صافي الربح مابيطرحش المستثنى", () => {
  const order = {
    order_status: "delivered",
    order_date: "2026-09-10T10:00:00Z",
    delivered_at: "2026-09-11T10:00:00Z",
    shipping_price: 0,
    discount: 0,
    bosta_shipping_cost: 0,
    bosta_fees_real: 0,
    bosta_cod: 1000,
    bosta_collected: true,
    order_items: [{ quantity: 1, sale_price_at_order: 1000, cost_price_at_order: 400 }],
  };

  it("الخامات اتحسبت على المنتج (٤٠٠) — مصروفها مايتطرحش تاني", () => {
    const h = computeHeadline(
      [order] as never,
      [
        { amount: 100, category: "إعلانات" },
        { amount: 400, category: "تصنيع وخامات" },
        { amount: 300, category: "سحوبات" },
      ],
      "2026-09-01",
      "2026-09-30"
    );
    expect(h.expensesTotal).toBe(100);
    expect(h.expensesExcluded).toBe(700);
    // مجمل الربح ٦٠٠ − إعلانات ١٠٠ = ٥٠٠ (مش ٥٠٠ − ٤٠٠ − ٣٠٠)
    expect(h.netProfit).toBe(500);
  });
});

describe("«مرتجعات» مقفولة", () => {
  it("مابتتعرضش في الأنواع الجاهزة", () => {
    expect(EXPENSE_CATEGORIES).not.toContain("مرتجعات");
    expect(closedCategory(" مرتجعات ")?.category).toBe("مرتجعات");
    expect(closedCategory("بضاعة")).toBeNull();
  });

  it("⚠️ القديم بيفضل في الربح — هو المكان الوحيد لريفند الأوردرات القديمة", () => {
    expect(countsInProfit("مرتجعات")).toBe(true);
  });
});
