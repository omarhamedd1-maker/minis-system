import { describe, expect, it } from "vitest";
import { lastMonths, monthEnd, monthLabel, monthlyReport } from "./monthly-report";
import type { StatOrder } from "./dashboard-stats";

const order = (date: string, status: string, price: number, cost = 0): StatOrder =>
  ({
    order_status: status,
    order_date: `${date}T10:00:00.000Z`,
    delivered_at: null,
    shipping_price: 0,
    discount: 0,
    bosta_shipping_cost: 0,
    bosta_fees_real: null,
    bosta_cod: null,
    bosta_collected: null,
    order_items: [{ quantity: 1, sale_price_at_order: price, cost_price_at_order: cost }],
  }) as unknown as StatOrder;

describe("حدود الشهر", () => {
  it("آخر يوم بيتحسب صح — وفبراير الكبيسة كمان", () => {
    expect(monthEnd("2026-01")).toBe("2026-01-31");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2024-02")).toBe("2024-02-29");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });

  it("آخر شهور بترجع الأحدث الأول وبتعدّي السنة", () => {
    expect(lastMonths("2026-02-15", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });

  it("الاسم بالعربي", () => {
    expect(monthLabel("2026-08")).toBe("أغسطس 2026");
  });
});

describe("التقرير الشهري", () => {
  const orders = [
    order("2026-08-05", "delivered", 100, 40),
    order("2026-08-06", "delivered", 100, 40),
    order("2026-08-07", "returned", 100, 40),
    order("2026-07-05", "delivered", 100, 40),
    // الملغي مايتحسبش لا في المبيعات ولا في نسبة الرجوع
    order("2026-08-08", "cancelled", 999, 0),
  ];

  it("بيرجّع عدد الشهور المطلوب، الأحدث الأول", () => {
    const r = monthlyReport(orders, [], "2026-08-19", 3);
    expect(r.map((x) => x.month)).toEqual(["2026-08", "2026-07", "2026-06"]);
  });

  it("**نسبة الرجوع على اللي اتشحن بس** — الملغي بره", () => {
    const r = monthlyReport(orders, [], "2026-08-19", 2);
    expect(r[0].returned).toBe(1);
    expect(r[0].returnRate).toBe(33);
  });

  it("**المصاريف بتتفلتر بتاريخها** — مش كل المصاريف على كل شهر", () => {
    const exp = [
      { amount: 50, expense_date: "2026-08-10" },
      { amount: 900, expense_date: "2026-05-10" },
    ];
    const r = monthlyReport(orders, exp, "2026-08-19", 2);
    expect(r[0].head.expensesTotal).toBe(50);
    expect(r[1].head.expensesTotal).toBe(0);
  });

  it("**الفرق بيتحسب عن الشهر اللي قبله**، وأقدم شهر مالوش فرق", () => {
    const r = monthlyReport(orders, [], "2026-08-19", 3);
    expect(r[0].profitDelta).toBe(r[0].head.netProfit - r[1].head.netProfit);
    expect(r[r.length - 1].profitDelta).toBeNull();
  });

  it("الشهر الفاضي بيرجع أصفار مش يقع", () => {
    const r = monthlyReport([], [], "2026-08-19", 2);
    expect(r[0].head.sales).toBe(0);
    expect(r[0].returnRate).toBe(0);
  });
});
