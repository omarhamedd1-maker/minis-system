import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORIES } from "./format";
import { NOT_IN_PROFIT, countsInProfit } from "./profit-exclusions";
import { EXPENSE_GROUPS, groupCategories, groupOf, groupTotals } from "./expense-groups";

describe("مجموعات المصاريف", () => {
  it("⚠️⚠️ «برّه الربح» = اللي مابيتطرحش من الربح بالظبط", () => {
    const outside = EXPENSE_GROUPS.find((g) => g.key === "outside")!;
    expect([...outside.categories].sort()).toEqual(NOT_IN_PROFIT.map((c) => c.category).sort());
    for (const g of EXPENSE_GROUPS.filter((g) => g.key !== "outside")) {
      for (const c of g.categories) expect(countsInProfit(c), c).toBe(true);
    }
  });

  it("كل نوع جاهز ليه مجموعة مكتوبة — مش بيقع في «تشغيل» بالصدفة", () => {
    const listed = EXPENSE_GROUPS.flatMap((g) => g.categories);
    for (const c of EXPENSE_CATEGORIES) expect(listed, c).toContain(c);
  });

  it("النوع الواحد في مجموعة واحدة", () => {
    const listed = EXPENSE_GROUPS.flatMap((g) => g.categories);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("أنواع مينيز الحقيقية", () => {
    expect(groupOf("تصنيع وخامات").key).toBe("outside");
    expect(groupOf("سحوبات").key).toBe("outside");
    expect(groupOf("بضاعة").key).toBe("outside");
    expect(groupOf("باقة بوسطة").key).toBe("outside");
    expect(groupOf("إعلانات").key).toBe("marketing");
    expect(groupOf("تسويق").key).toBe("marketing");
    expect(groupOf("تغليف").key).toBe("sale");
    expect(groupOf("مرتجعات").key).toBe("sale");
    expect(groupOf(" اشتراكات ").key).toBe("running");
  });

  it("النوع الجديد بيروح «تشغيل» — مابيختفيش", () => {
    expect(groupOf("كهربا").key).toBe("running");
    expect(groupOf(null).key).toBe("running");
  });
});

describe("المنسدلة متقسّمة", () => {
  it("بترتيب المجموعات · والفاضية مابتظهرش · والجديد في الآخر", () => {
    expect(groupCategories(["سحوبات", "كهربا", "إعلانات", "أخرى", "إعلانات", "اشتراكات"])).toEqual([
      { label: "تسويق", categories: ["إعلانات"] },
      { label: "تشغيل", categories: ["اشتراكات", "أخرى", "كهربا"] },
      { label: "برّه الربح", categories: ["سحوبات"] },
    ]);
  });
});

describe("المجاميع", () => {
  it("بتتجمع بالمجموعة واللي صفر مايظهرش", () => {
    expect(
      groupTotals([
        { amount: 100, category: "إعلانات" },
        { amount: 50, category: "تسويق" },
        { amount: 1000, category: "تصنيع وخامات" },
        { amount: 20, category: "كهربا" },
      ])
    ).toEqual([
      { key: "marketing", label: "تسويق", total: 150 },
      { key: "running", label: "تشغيل", total: 20 },
      { key: "outside", label: "برّه الربح", total: 1000 },
    ]);
  });
});
