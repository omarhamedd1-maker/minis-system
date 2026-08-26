import { describe, it, expect } from "vitest";
import {
  prepaidValue,
  prepaidLine,
  MIN_SETTLED,
  type PrepaidInput,
} from "./prepaid-value";

const input = (x: Partial<PrepaidInput> = {}): PrepaidInput => ({
  codSettled: 301,
  codReturned: 50,
  prepaidCount: 6,
  returnShippingCost: 100,
  averageOrder: 1700,
  ...x,
});

describe("قيمة الدفع المقدم", () => {
  it("بيحسب نسبة الرجوع والخسارة المتوقعة", () => {
    const v = prepaidValue(input());
    expect(v.codReturnRate).toBe(16.6);
    // ١٦٫٦٪ × ١٠٠ جنيه شحن
    expect(v.lossPerCod).toBe(16.6);
    expect(v.burned).toBe(5000);
  });

  it("الخصم اللي يستاهل = اللي بتوفّره", () => {
    const v = prepaidValue(input());
    expect(v.worthDiscount).toBe(17);
    expect(v.worthPercent).toBe(1);
  });

  it("⚠️⚠️ النسبة مابتتعرضش على أرقام قليلة", () => {
    const v = prepaidValue(input({ codSettled: MIN_SETTLED - 1, codReturned: 10 }));
    expect(v.codReturnRate).toBeNull();
    expect(v.lossPerCod).toBeNull();
    expect(v.worthDiscount).toBeNull();
    expect(v.weak).toBe(true);
  });

  it("⚠️⚠️ الحسبة من رجوع الاستلام مش من مقارنة الطريقتين", () => {
    // ٦ أوردرات مدفوعة مقدم صفر رجوع — مالهاش أي تأثير على الرقم
    const few = prepaidValue(input({ prepaidCount: 6 }));
    const none = prepaidValue(input({ prepaidCount: 0 }));
    expect(few.lossPerCod).toBe(none.lossPerCod);
    expect(few.prepaidCount).toBe(6);
  });

  it("مافيش رجوع = مافيش خسارة متوقعة", () => {
    const v = prepaidValue(input({ codReturned: 0 }));
    expect(v.codReturnRate).toBe(0);
    expect(v.lossPerCod).toBe(0);
    expect(v.burned).toBe(0);
  });

  it("⚠️ الشحن صفر = الخسارة صفر مش قسمة على صفر", () => {
    const v = prepaidValue(input({ returnShippingCost: 0 }));
    expect(v.lossPerCod).toBe(0);
    expect(v.worthDiscount).toBe(0);
  });

  it("⚠️ متوسط الأوردر صفر = مافيش نسبة مئوية للخصم", () => {
    expect(prepaidValue(input({ averageOrder: 0 })).worthPercent).toBeNull();
  });

  it("الأرقام السالبة بتتصفّر", () => {
    const v = prepaidValue(
      input({ codReturned: -5, returnShippingCost: -100, averageOrder: -1 })
    );
    expect(v.codReturnRate).toBe(0);
    expect(v.burned).toBe(0);
    expect(v.worthPercent).toBeNull();
  });

  it("مافيش أوردرات خالص = مافيش قسمة على صفر", () => {
    const v = prepaidValue(input({ codSettled: 0, codReturned: 0 }));
    expect(v.codReturnRate).toBeNull();
    expect(v.weak).toBe(true);
  });

  it("⚠️ الجملة بتقول الرقم ومن فين جه، من غير «اعمل كذا»", () => {
    const text = prepaidLine(prepaidValue(input()));
    expect(text).toContain("16.6%");
    expect(text).toContain("خسارة متوقعة");
    expect(text).not.toContain("لازم");
    expect(text).not.toContain("اعمل");
  });

  it("والأرقام القليلة بتقول كده صراحة", () => {
    const text = prepaidLine(prepaidValue(input({ codSettled: 5 })));
    expect(text).toContain("لسه مافيش");
  });
});
