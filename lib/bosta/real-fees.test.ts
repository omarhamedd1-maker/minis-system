import { describe, expect, it } from "vitest";
import { bundleCovered, realFees, realFeesBreakdown } from "./real-fees";

describe("الباقة غطّت الشحن ولا لأ", () => {
  it("أوردر ١٣٢٠: شحن ٨٨ واتخصم ٢٢٫٧٨ = الباقة غطّته", () => {
    expect(bundleCovered(22.78, 88)).toBe(true);
  });

  it("أوردر ١٠٧٤: شحن ١١٣ واتخصم ١٣٥٫٦٦ = الباقة ماغطّتوش", () => {
    expect(bundleCovered(135.66, 113)).toBe(false);
  });

  it("الأرقام الناقصة مابتتحسبش تغطية", () => {
    expect(bundleCovered(null, 88)).toBe(false);
    expect(bundleCovered(22.78, null)).toBe(false);
    expect(bundleCovered(0, 88)).toBe(false);
  });
});

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

// ==========================================================================
// كشوف حقيقية من بوسطة — ١٠ أغسطس ٢٠٢٦
// --------------------------------------------------------------------------
// **`bosta_fees` بتبقى صفر لما بوسطة تخصم من الرصيد بدل التحصيل.** الكود
// القديم كان بيقرا `bosta_fees` بس ويرمي الشحنة كلها، فـ**٣٩ شحنة متسلّمة
// من شهور** كانت ماشية بتقدير بدل رقم حقيقي متاح.
// ==========================================================================

describe("الرسوم اللي بوسطة بتخصمها من الرصيد", () => {
  // أوردر ١١٢٩: شحن ٨٨ − باقة ٨٨ = ٠ · استعجال ١٢ · ضريبة ١٫٦٨ = ١٣٫٦٨
  it("أوردر ١١٢٩ — بتتقرا من الرصيد المستهلك", () => {
    const f = realFees({
      cashCycle: {
        bosta_fees: "0.00",
        shipping_fees: "88.00",
        bundle_discount: "88.00",
        expedite_fees: "12.00",
        vat: "1.68",
        bosta_credits_consumed: 13.68,
      },
    });
    expect(f?.total).toBe(13.68);
    expect(f?.shipping).toBe(88);
    expect(f?.expedite).toBe(12);
  });

  // أوردر ١١٣٠: تحصيل ٥٫٤٠ · استعجال ٢٥٫٤٠ · ضريبة ٤٫٣١ = ٣٥٫١١
  it("أوردر ١١٣٠", () => {
    const f = realFees({
      cashCycle: {
        bosta_fees: "0.00",
        shipping_fees: "88.00",
        bundle_discount: "88.00",
        collection_fees: "5.40",
        expedite_fees: "25.40",
        vat: "4.31",
        bosta_credits_consumed: 35.11,
      },
    });
    expect(f?.total).toBe(35.11);
  });

  // أوردر ١١٧٩ (مرتجع): تأمين ١٢٫٩٨ · فتح ٧ · ضريبة ٢٫٨٠ = ٢٢٫٧٨
  it("أوردر ١١٧٩ — مرتجع", () => {
    const f = realFees({
      cashCycle: {
        bosta_fees: "0.00",
        shipping_fees: "88.00",
        bundle_discount: "88.00",
        insurance_fees: "12.98",
        opening_package_fees: "7.00",
        vat: "2.80",
        bosta_credits_consumed: 22.78,
      },
    });
    expect(f?.total).toBe(22.78);
    expect(f?.opening).toBe(7);
  });

  it("**`bosta_fees` لما تكون موجودة هي الأصل**", () => {
    const f = realFees({
      cashCycle: {
        bosta_fees: "135.66",
        shipping_fees: "113.00",
        bosta_credits_consumed: 999,
      },
    });
    expect(f?.total).toBe(135.66);
  });

  // آخر ملجأ: الرقمين فاضيين فبنجمع البنود بنفسنا
  it("مفيش إجمالي ولا رصيد؟ بنجمع البنود", () => {
    const f = realFees({
      cashCycle: {
        shipping_fees: "88.00",
        bundle_discount: "88.00",
        expedite_fees: "10.00",
        vat: "1.40",
      },
    });
    expect(f?.total).toBe(11.4);
  });

  it("صفر بجد؟ بنفضل نستنى بدل ما نقفل على صفر", () => {
    expect(realFees({ cashCycle: { bosta_fees: "0.00" } })).toBe(null);
  });

  // الباقة غطّت الشحن: ١٣٫٦٨ أقل من ٨٨
  it("تغطية الباقة لسه بتتحسب صح مع الرقم الجديد", () => {
    expect(bundleCovered(13.68, 88)).toBe(true);
  });
});
