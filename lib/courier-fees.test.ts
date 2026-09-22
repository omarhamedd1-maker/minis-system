import { describe, expect, it } from "vitest";
import { breakdownFees, feeGroup } from "./courier-fees";

/**
 * ⚠️ **الأرقام دي من كشف مينيز الحقيقي** (٩٤ تحويل · أكتوبر ٢٠٢٥ →
 * سبتمبر ٢٠٢٦)، مش مثال متخيّل.
 */
const REAL = [
  { category: "Cash Collection Cycle", amount: 537598 },
  { category: "Cash Out", amount: -512082.91 },
  { category: "Bosta Fees Cycle", amount: -22133.89 },
  { category: "Bundle Subscription", amount: -4500 },
  { category: "Pickup Fees", amount: -1470 },
  { category: "Packing Material", amount: -500 },
  { category: "Compensation", amount: 2818.8 },
  { category: "Recharge balance", amount: 295 },
  { category: "Balance Adjustment", amount: -25 },
];

describe("تصنيف رسوم بوسطة", () => {
  it("كل تصنيف في مجموعته", () => {
    expect(feeGroup("Bosta Fees Cycle")).toBe("shipping");
    expect(feeGroup("Pickup Fees")).toBe("fixed");
    expect(feeGroup("Bundle Subscription")).toBe("fixed");
    expect(feeGroup("Compensation")).toBe("income");
    expect(feeGroup("cash out")).toBe("other");
    expect(feeGroup("حاجة جديدة")).toBe("other");
  });

  it("⚠️⚠️ رسوم الشحن منفصلة عن الثابتة — واحدة بتكبر مع النمو والتانية لأ", () => {
    const r = breakdownFees(REAL, 537598);
    expect(r.shipping).toBe(22133.89);
    expect(r.fixed).toBe(6470); // ٤٥٠٠ + ١٤٧٠ + ٥٠٠
  });

  it("⚠️⚠️ التعويضات دخل مش مصروف — بتتطرح", () => {
    const r = breakdownFees(REAL, 537598);
    expect(r.income).toBe(3113.8); // ٢٨١٨٫٨ + ٢٩٥
    expect(r.net).toBe(25490.09); // ٢٢١٣٣٫٨٩ + ٦٤٧٠ − ٣١١٣٫٨
  });

  it("النسبة من التحصيل — ودي اللي بتتقارن شهر بشهر", () => {
    const r = breakdownFees(REAL, 537598);
    expect(r.percent).toBe(4.74);
  });

  it("⚠️ التحصيل صفر = مفيش نسبة، مش صفر بالمية", () => {
    expect(breakdownFees(REAL, 0).percent).toBeNull();
  });

  it("التحصيل والتحويل نفسهم مش رسوم", () => {
    const r = breakdownFees(REAL, 537598);
    expect(r.lines.some((l) => l.category === "Cash Out")).toBe(false);
    expect(r.lines.some((l) => l.category === "Cash Collection Cycle")).toBe(false);
  });

  it("بيجمع المتكرر — الكشف فيه ١٥٧ صف رسوم", () => {
    const r = breakdownFees(
      [
        { category: "Bosta Fees Cycle", amount: -100 },
        { category: "Bosta Fees Cycle", amount: -56.64 },
      ],
      1000
    );
    expect(r.shipping).toBe(156.64);
  });
});
