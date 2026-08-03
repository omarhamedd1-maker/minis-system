import { describe, expect, it } from "vitest";
import { realFees, realFeesBreakdown } from "./real-fees";

// كشف حساب أوردر ١٠٧٤ الحقيقي زي ما بوسطة ردّت بيه بالظبط
const CYCLE_1074 = {
  cashCycle: {
    cod: "0.00",
    bosta_fees: "135.66",
    shipping_fees: "113.00",
    collection_fees: "0.00",
    cod_fees: "0.00",
    insurance_fees: "6.00",
    opening_package_fees: "0.00",
    vat: "16.66",
    rto_discount: "0.00",
    bundle_discount: "0.00",
  },
};

describe("رسوم بوسطة الحقيقية", () => {
  it("بتقرا الكشف الحقيقي وبتحوّل النصوص لأرقام", () => {
    const f = realFees(CYCLE_1074);
    expect(f).not.toBeNull();
    expect(f!.total).toBe(135.66);
    expect(f!.shipping).toBe(113);
    expect(f!.insurance).toBe(6);
    expect(f!.vat).toBe(16.66);
  });

  it("البنود بتجمع على الإجمالي", () => {
    const f = realFees(CYCLE_1074)!;
    expect(f.shipping + f.insurance + f.cod + f.collection + f.opening + f.vat).toBe(
      f.total
    );
  });

  it("**الشحن الحقيقي ١١٣ مش ٨٨** — الافتراض الثابت غلط", () => {
    expect(realFees(CYCLE_1074)!.shipping).toBe(113);
  });

  it("الشحنة اللي لسه ماقفلتش دورة الكاش = مفيش رقم نهائي", () => {
    // مانخزّنش رقم لسه بيتحرك
    expect(realFees({ cashCycle: { bosta_fees: "0.00" } })).toBeNull();
    expect(realFees({ cashCycle: {} })).toBeNull();
    expect(realFees({ cashCycle: null })).toBeNull();
    expect(realFees(null)).toBeNull();
    expect(realFees({})).toBeNull();
  });

  it("بتستحمل الأرقام كنصوص أو كأرقام أو بفاصلة", () => {
    expect(realFees({ cashCycle: { bosta_fees: 135.66 } })!.total).toBe(135.66);
    expect(realFees({ cashCycle: { bosta_fees: "1,135.66" } })!.total).toBe(1135.66);
  });

  it("النص البايظ بيتحسب صفر مش NaN", () => {
    const f = realFees({ cashCycle: { bosta_fees: "50", shipping_fees: "مش رقم" } });
    expect(f!.shipping).toBe(0);
    expect(f!.total).toBe(50);
  });

  it("التفصيلة بتشيل الأصفار — الكشف أغلبه أصفار", () => {
    const rows = realFeesBreakdown(realFees(CYCLE_1074)!);
    expect(rows.map((r) => r.label)).toEqual(["الشحن", "التأمين", "ضريبة"]);
  });
});
