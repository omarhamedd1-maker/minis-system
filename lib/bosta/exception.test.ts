import { describe, expect, it } from "vitest";
import {
  exceptionAdvice,
  exceptionKey,
  newFailedAttempt,
  reasonInArabic,
  summarizeException,
} from "./exception";

describe("محاولة فاشلة جديدة", () => {
  it("أول محاولة = تنبيه", () => {
    // ودي اللي التنبيه كان بيتأخر عليها لحد ما الأوردر يبقى راجع خلاص
    expect(newFailedAttempt(null, "العميل مش بيرد (٣ أغسطس)")).toBe(true);
    expect(newFailedAttempt("", "العميل رفض يستلم (٣ أغسطس)")).toBe(true);
  });

  it("محاولة تانية فشلت = تنبيه تاني", () => {
    expect(
      newFailedAttempt(
        "العميل مش بيرد (٣ أغسطس) — 2 محاولات",
        "العميل مش بيرد (٤ أغسطس) — 3 محاولات"
      )
    ).toBe(true);
  });

  it("نفس المحاولة والتاريخ اتغيّر بس = سكوت", () => {
    // بوسطة بتعدّل الجدولة من غير ما يحصل جديد — ده مايستاهلش إشعار
    expect(
      newFailedAttempt(
        "العميل طلب التأجيل (٣ أغسطس) — 2 محاولات",
        "العميل طلب التأجيل (٥ أغسطس) — 2 محاولات — اتجدولت ٧ أغسطس"
      )
    ).toBe(false);
  });

  it("السبب اتغيّر = تنبيه حتى لو نفس عدد المحاولات", () => {
    expect(
      newFailedAttempt(
        "العميل طلب التأجيل (٣ أغسطس) — 2 محاولات",
        "العميل رفض يستلم (٤ أغسطس) — 2 محاولات"
      )
    ).toBe(true);
  });

  it("السبب اتشال = مفيش تنبيه", () => {
    expect(newFailedAttempt("العميل مش بيرد", null)).toBe(false);
  });

  it("المفتاح بيشيل التواريخ ويسيب السبب والمحاولات", () => {
    expect(exceptionKey("العميل رفض يستلم (٣ أغسطس) — 2 محاولات")).toBe(
      "العميل رفض يستلم|2"
    );
    expect(exceptionKey(null)).toBe("");
  });
});

describe("نعمل إيه في الأوردر الواقف", () => {
  it("العميل مش بيرد: نكلّمه — ومفيش «عدّل العنوان»", () => {
    // ده كان الغلط: كل أوردر واقف بيعرض «عدّل العنوان» حتى لو العنوان مظبوط
    const a = exceptionAdvice("العميل مش بيرد (٣ أغسطس) — ٢ محاولات");
    expect(a.actions).toContain("whatsapp");
    expect(a.actions).not.toContain("address");
  });

  it("العنوان غلط: نعدّل العنوان", () => {
    const a = exceptionAdvice("العنوان غلط");
    expect(a.actions).toContain("address");
    expect(a.title).toBe("العنوان غلط");
  });

  it("بره التغطية بتكسب على «العنوان» العامة", () => {
    // الاتنين فيهم كلمة "العنوان" — والترتيب هو اللي بيفصل
    const a = exceptionAdvice("العنوان بره نطاق التغطية");
    expect(a.title).toContain("بره تغطية");
    expect(a.actions).toContain("cancel");
  });

  it("رقم التليفون غلط: نصحّح الرقم مش العنوان", () => {
    const a = exceptionAdvice("رقم التليفون غلط");
    expect(a.actions).toContain("phone");
    expect(a.actions).not.toContain("address");
  });

  it("التأجيل مالوش زرار إلغاء — الشحنة لسه ماشية", () => {
    const a = exceptionAdvice("العميل طلب التأجيل (٤ أغسطس)");
    expect(a.actions).toEqual(["whatsapp"]);
  });

  it("السبب المش معروف أو الفاضي بياخد النصيحة العامة", () => {
    for (const r of [null, "", "Some new reason from Bosta"]) {
      const a = exceptionAdvice(r);
      expect(a.title).toBe("بوسطة واقفة ومستنية قرار منك");
      expect(a.actions).toContain("whatsapp");
    }
  });
});

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
