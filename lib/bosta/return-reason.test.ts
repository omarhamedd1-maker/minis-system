import { describe, it, expect } from "vitest";
import { returnReasonFromBosta } from "./return-reason";
import { isReturnReason } from "../return-reasons";

const at = (n: number) => `2026-05-0${n}T10:00:00.000Z`;

describe("سبب الرجوع من بوسطة", () => {
  it("بيقرا الكود", () => {
    expect(returnReasonFromBosta([{ code: 8, time: at(1) }])).toBe(
      "refused_on_delivery"
    );
    expect(returnReasonFromBosta([{ code: 13, time: at(1) }])).toBe(
      "unclear_address"
    );
  });

  it("⚠️ آخر محاولة هي السبب مش أول واحدة", () => {
    // أجّل ٣ مرات وبعدين رفض — الشحنة رجعت عشان الرفض
    const reason = returnReasonFromBosta([
      { code: 3, time: at(1) },
      { code: 3, time: at(2) },
      { code: 3, time: at(3) },
      { code: 8, time: at(4) },
    ]);
    expect(reason).toBe("refused_on_delivery");
  });

  it("الترتيب بالوقت مش بترتيب المصفوفة", () => {
    const reason = returnReasonFromBosta([
      { code: 8, time: at(4) },
      { code: 3, time: at(1) },
    ]);
    expect(reason).toBe("refused_on_delivery");
  });

  it("الكود الجديد بيتقري من الجملة", () => {
    expect(
      returnReasonFromBosta([{ code: 999, reason: "Customer refuses to receive" }])
    ).toBe("refused_on_delivery");
    expect(
      returnReasonFromBosta([{ code: 999, reason: "Shipment damaged in transit" }])
    ).toBe("damaged");
  });

  it("محاولة مش مفهومة = سبب تاني", () => {
    expect(returnReasonFromBosta([{ code: 999, reason: "حاجة جديدة" }])).toBe(
      "other"
    );
  });

  it("⚠️ مافيش محاولات = مانعرفش، مش «سبب تاني»", () => {
    expect(returnReasonFromBosta(null)).toBeNull();
    expect(returnReasonFromBosta([])).toBeNull();
    expect(returnReasonFromBosta([{ code: null, reason: null }])).toBeNull();
  });

  it("التاريخ الغلط مابيوقعش الحساب", () => {
    expect(returnReasonFromBosta([{ code: 8, time: "مش تاريخ" }])).toBe(
      "refused_on_delivery"
    );
  });

  it("⚠️ إلغاء التاجر مش سبب عميل", () => {
    expect(returnReasonFromBosta([{ code: 6, time: at(1) }])).toBe("other");
    expect(returnReasonFromBosta([{ code: 23, time: at(1) }])).toBe("other");
  });

  it("كل الأكواد بترجّع سبب موجود في قايمتنا فعلًا", () => {
    for (const code of [1, 2, 3, 6, 7, 8, 13, 21, 23, 25, 104]) {
      const value = returnReasonFromBosta([{ code, time: at(1) }])!;
      expect(isReturnReason(value), `الكود ${code} رجّع ${value}`).toBe(true);
    }
  });
});
