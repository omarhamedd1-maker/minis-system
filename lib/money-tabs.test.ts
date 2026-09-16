import { describe, expect, it } from "vitest";
import { expensesRedirectPath, moneyTabsFor, pickMoneyTab } from "./money-tabs";

describe("expensesRedirectPath — اللينكات القديمة ماتتكسرش", () => {
  it("من غير باراميترات", () => {
    expect(expensesRedirectPath({})).toBe("/cash?tab=expenses");
  });

  it("الفترة والنوع بيتنقلوا زي ما هم", () => {
    const url = expensesRedirectPath({ cat: "إعلانات", period: "month" });
    const q = new URL(url, "http://x").searchParams;
    expect(q.get("tab")).toBe("expenses");
    expect(q.get("cat")).toBe("إعلانات");
    expect(q.get("period")).toBe("month");
  });

  it("مدة مخصصة + رسايل الحفظ والخطأ", () => {
    const q = new URL(
      expensesRedirectPath({ from: "2026-09-01", to: "2026-09-10", saved: "1", error: "حصل خطأ" }),
      "http://x"
    ).searchParams;
    expect([q.get("from"), q.get("to"), q.get("saved"), q.get("error")]).toEqual([
      "2026-09-01",
      "2026-09-10",
      "1",
      "حصل خطأ",
    ]);
  });

  it("tab قديم في اللينك مايغلبش — المصاريف دايمًا", () => {
    const q = new URL(expensesRedirectPath({ tab: "moves" }), "http://x").searchParams;
    expect(q.getAll("tab")).toEqual(["expenses"]);
  });

  it("الباراميتر المكرر بيتنقل كله", () => {
    const q = new URL(expensesRedirectPath({ x: ["1", "2"] }), "http://x").searchParams;
    expect(q.getAll("x")).toEqual(["1", "2"]);
  });
});

describe("التابات بالصلاحية", () => {
  const has = (list: string[]) => (p: string) => list.includes(p);

  it("المحاسب بيشوف الاتنين", () => {
    expect(moneyTabsFor(has(["cash.view", "expenses.view"])).map((t) => t.key)).toEqual([
      "moves",
      "expenses",
    ]);
  });

  it("معاه المصاريف بس — تاب واحد", () => {
    const tabs = moneyTabsFor(has(["expenses.view"]));
    expect(tabs.map((t) => t.key)).toEqual(["expenses"]);
    // ولو طلب الحركات بلينك، بيفتح المصاريف مش صفحة فاضية
    expect(pickMoneyTab("moves", tabs)).toBe("expenses");
  });

  it("الافتراضي الحركات", () => {
    const tabs = moneyTabsFor(has(["cash.view", "expenses.view"]));
    expect(pickMoneyTab(undefined, tabs)).toBe("moves");
    expect(pickMoneyTab("كلام", tabs)).toBe("moves");
    expect(pickMoneyTab("expenses", tabs)).toBe("expenses");
  });
});
