import { describe, it, expect } from "vitest";
import {
  parseAmount,
  parseDate,
  parseCategory,
  readReceipt,
  readSummary,
  checkImage,
  toEnglishDigits,
  MAX_AMOUNT,
  MAX_IMAGE_BYTES,
} from "./receipt";

const TODAY = "2026-08-25";

describe("قراية المبلغ", () => {
  it("الرقم العادي", () => {
    expect(parseAmount(350)).toBe(350);
    expect(parseAmount("350")).toBe(350);
  });

  it("⚠️ فاصلة الآلاف بتتشال والكسر بيفضل", () => {
    expect(parseAmount("1,250.50")).toBe(1250.5);
    expect(parseAmount("١٬٢٥٠٫٥٠")).toBe(1250.5);
  });

  it("الأرقام العربي بتتقرا", () => {
    expect(parseAmount("٣٥٠")).toBe(350);
    expect(toEnglishDigits("٢٠٢٦")).toBe("2026");
  });

  it("العملة بتتشال", () => {
    expect(parseAmount("350 ج.م")).toBe(350);
    expect(parseAmount("EGP 350")).toBe(350);
    expect(parseAmount("350 جنيه")).toBe(350);
  });

  it("⚠️ الصفر والسالب مش مبلغ", () => {
    expect(parseAmount(0)).toBeNull();
    expect(parseAmount(-50)).toBeNull();
  });

  it("⚠️ الرقم الخيالي قراية غلط مش مصروف", () => {
    expect(parseAmount(MAX_AMOUNT + 1)).toBeNull();
    expect(parseAmount(MAX_AMOUNT)).toBe(MAX_AMOUNT);
  });

  it("اللي مش رقم بيرجع فاضي", () => {
    expect(parseAmount("مش مكتوب")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount({})).toBeNull();
    expect(parseAmount(".")).toBeNull();
  });
});

describe("قراية التاريخ", () => {
  it("الصيغة العالمية", () => {
    expect(parseDate("2026-08-20", TODAY)).toBe("2026-08-20");
    expect(parseDate("2026-8-5", TODAY)).toBe("2026-08-05");
  });

  it("⚠️⚠️ ٢٥/٠٨ عندنا يوم/شهر مش شهر/يوم", () => {
    expect(parseDate("20/08/2026", TODAY)).toBe("2026-08-20");
    expect(parseDate("05/08/2026", TODAY)).toBe("2026-08-05");
  });

  it("الشرطة والنقطة زي الشرطة المايلة", () => {
    expect(parseDate("20-08-2026", TODAY)).toBe("2026-08-20");
    expect(parseDate("20.08.2026", TODAY)).toBe("2026-08-20");
  });

  it("سنة من رقمين", () => {
    expect(parseDate("20/08/26", TODAY)).toBe("2026-08-20");
  });

  it("الأرقام العربي في التاريخ", () => {
    expect(parseDate("٢٠/٠٨/٢٠٢٦", TODAY)).toBe("2026-08-20");
  });

  it("⚠️⚠️ بكرة مش تاريخ إيصال", () => {
    expect(parseDate("2026-08-26", TODAY)).toBeNull();
    expect(parseDate("2026-08-25", TODAY)).toBe("2026-08-25");
  });

  it("⚠️ التاريخ اللي مش موجود بيترفض", () => {
    expect(parseDate("31/02/2026", TODAY)).toBeNull();
    expect(parseDate("2026-13-01", TODAY)).toBeNull();
    expect(parseDate("2026-00-10", TODAY)).toBeNull();
  });

  it("الكلام مش تاريخ", () => {
    expect(parseDate("امبارح", TODAY)).toBeNull();
    expect(parseDate(null, TODAY)).toBeNull();
    expect(parseDate(20260820, TODAY)).toBeNull();
  });
});

describe("النوع", () => {
  it("اللي من القايمة بيعدّي", () => {
    expect(parseCategory("بضاعة")).toBe("بضاعة");
    expect(parseCategory("  شحن  ")).toBe("شحن");
  });

  it("⚠️ اللي بره القايمة بيرجع فاضي مش بيتضاف", () => {
    expect(parseCategory("حاجة تانية خالص")).toBeNull();
    expect(parseCategory("")).toBeNull();
    expect(parseCategory(5)).toBeNull();
  });
});

describe("قراية الإيصال", () => {
  it("الإيصال الكامل", () => {
    const r = readReceipt(
      { amount: "٣٥٠", date: "20/08/2026", vendor: "مكتبة سمير", category: "تغليف", note: "ورق" },
      TODAY
    );
    expect(r).toMatchObject({
      amount: 350,
      date: "2026-08-20",
      vendor: "مكتبة سمير",
      category: "تغليف",
      note: "ورق",
      missing: [],
    });
  });

  it("⚠️ الناقص بيتقال بالاسم", () => {
    const r = readReceipt({ amount: 350 }, TODAY);
    expect(r.missing).toEqual(["التاريخ", "النوع"]);
    expect(readSummary(r)).toContain("التاريخ و النوع".replace(" و ", " و"));
  });

  it("⚠️⚠️ اللي مش متأكد منه بيرجع فاضي مش مخمّن", () => {
    const r = readReceipt(
      { amount: "مش واضح", date: "مش واضح", category: "مش واضح" },
      TODAY
    );
    expect(r.amount).toBeNull();
    expect(r.date).toBeNull();
    expect(r.category).toBeNull();
    expect(readSummary(r)).toContain("اكتبها بإيدك");
  });

  it("الفاضي مايوقّعش", () => {
    expect(() => readReceipt({}, TODAY)).not.toThrow();
    expect(readReceipt({}, TODAY).missing).toHaveLength(3);
  });

  it("الكلام الطويل بيتقص", () => {
    const r = readReceipt({ vendor: "ا".repeat(200), note: "ب".repeat(500) }, TODAY);
    expect(r.vendor!.length).toBe(80);
    expect(r.note!.length).toBe(200);
  });

  it("الملخّص بيطمّن لما كله بان", () => {
    const r = readReceipt(
      { amount: 100, date: "2026-08-01", category: "شحن" },
      TODAY
    );
    expect(readSummary(r)).toContain("راجعها وأكّد");
  });
});

describe("فحص الصورة", () => {
  it("الصور المقبولة", () => {
    expect(checkImage({ type: "image/jpeg", size: 1000 })).toEqual({ ok: true });
    expect(checkImage({ type: "image/png", size: 1000 })).toEqual({ ok: true });
    expect(checkImage({ type: "image/webp", size: 1000 })).toEqual({ ok: true });
  });

  it("⚠️ PDF مش صورة", () => {
    const r = checkImage({ type: "application/pdf", size: 1000 });
    expect(r.ok).toBe(false);
  });

  it("⚠️ الكبيرة بتترفض قبل ما تتبعت", () => {
    const r = checkImage({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("٥ ميجا");
  });

  it("الفاضية بتترفض", () => {
    expect(checkImage({ type: "image/jpeg", size: 0 }).ok).toBe(false);
  });
});
