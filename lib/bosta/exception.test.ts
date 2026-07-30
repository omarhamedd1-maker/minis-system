import { describe, expect, it } from "vitest";
import { reasonInArabic, summarizeException } from "./exception";

describe("ترجمة سبب بوسطة", () => {
  it("بتترجم الأسباب اللي شفناها فعلًا", () => {
    expect(
      reasonInArabic("Cancellation - the customer refuses to receive the shipment.")
    ).toBe("العميل رفض يستلم");
    expect(
      reasonInArabic("Postponed - the customer requested postponement for another day.")
    ).toBe("العميل طلب التأجيل");
  });

  it("بتترجم الأسباب الشائعة التانية", () => {
    expect(reasonInArabic("Customer does not answer")).toBe("العميل مش بيرد");
    expect(reasonInArabic("Wrong address")).toBe("العنوان غلط");
    expect(reasonInArabic("Out of delivery zone")).toBe("العنوان بره نطاق التغطية");
  });

  it("السبب المش معروف بيتعرض زي ما هو — أحسن من إخفاؤه", () => {
    expect(reasonInArabic("Something totally new")).toBe("Something totally new");
  });

  it("الفاضي = null", () => {
    expect(reasonInArabic("")).toBeNull();
    expect(reasonInArabic(null)).toBeNull();
  });
});

describe("تلخيص المحاولات", () => {
  // دي البيانات الحقيقية من أوردر ١٣٦٤
  const real = {
    waitingForBusinessAction: true,
    lastExceptionCode: 8,
    exception: [
      {
        reason: "Cancellation - the customer refuses to receive the shipment.",
        code: 8,
        time: "2026-07-30T12:24:07.178Z",
        scheduledAt: null,
      },
      {
        reason: "Postponed - the customer requested postponement for another day.",
        code: 3,
        time: "2026-07-23T09:14:47.395Z",
        scheduledAt: "2026-07-30T03:00:00.000Z",
      },
    ],
  };

  it("بتبدأ بآخر محاولة وبتقول العدد", () => {
    const s = summarizeException(real);
    expect(s?.text).toContain("العميل رفض يستلم");
    expect(s?.text).toContain("2 محاولات");
    expect(s?.attempts).toBe(2);
    expect(s?.waiting).toBe(true);
  });

  it("بتقول التاريخ الجديد لو اتجدولت", () => {
    const s = summarizeException({
      exception: [
        {
          reason: "Postponed - the customer requested postponement for another day.",
          time: "2026-07-23T09:14:47.395Z",
          scheduledAt: "2026-07-30T03:00:00.000Z",
        },
      ],
    });
    expect(s?.text).toContain("اتجدولت");
    expect(s?.text).toContain("العميل طلب التأجيل");
  });

  it("مافيش تفاصيل بس بوسطة مستنية = بنقولها برضه", () => {
    const s = summarizeException({ waitingForBusinessAction: true, exception: [] });
    expect(s?.text).toContain("مستنية قرار");
    expect(s?.waiting).toBe(true);
  });

  it("مافيش حاجة خالص = null", () => {
    expect(summarizeException({ exception: [] })).toBeNull();
    expect(summarizeException(null)).toBeNull();
    expect(summarizeException(undefined)).toBeNull();
  });
});
