import { describe, expect, it } from "vitest";
import { normalizeGovernorate, zoneOfGovernorate } from "./zone-of";

describe("تنظيف اسم المحافظة", () => {
  it("بيوحّد الألف والياء والتاء المربوطة", () => {
    expect(normalizeGovernorate("الجيزة")).toBe(normalizeGovernorate("الجيزه"));
    expect(normalizeGovernorate("الجيزى")).toBe(normalizeGovernorate("الجيزي"));
    expect(normalizeGovernorate("الإسكندرية")).toBe(
      normalizeGovernorate("الاسكندريه")
    );
  });

  it("بيشيل ال التعريف والمسافات", () => {
    expect(normalizeGovernorate("  القاهرة  ")).toBe("قاهره");
  });
});

describe("المحافظة ← المنطقة", () => {
  it("القاهرة والجيزة", () => {
    expect(zoneOfGovernorate("القاهرة")).toBe("cairo_giza");
    expect(zoneOfGovernorate("الجيزه")).toBe("cairo_giza");
    expect(zoneOfGovernorate("Cairo")).toBe("cairo_giza");
    expect(zoneOfGovernorate("Giza")).toBe("cairo_giza");
  });

  it("أسوان في جنوب الصعيد — ده اللي جرّبناه على حاسبتهم", () => {
    expect(zoneOfGovernorate("أسوان")).toBe("south_saeed");
    expect(zoneOfGovernorate("اسوان")).toBe("south_saeed");
    expect(zoneOfGovernorate("Aswan")).toBe("south_saeed");
  });

  it("الدلتا والقناة", () => {
    expect(zoneOfGovernorate("الشرقية")).toBe("delta_canal");
    expect(zoneOfGovernorate("بورسعيد")).toBe("delta_canal");
    expect(zoneOfGovernorate("كفر الشيخ")).toBe("delta_canal");
  });

  it("شمال الصعيد", () => {
    expect(zoneOfGovernorate("المنيا")).toBe("north_saeed");
    expect(zoneOfGovernorate("سوهاج")).toBe("north_saeed");
  });

  it("سيناء والوادي الجديد", () => {
    expect(zoneOfGovernorate("شمال سيناء")).toBe("sinai_wadi");
    expect(zoneOfGovernorate("الوادي الجديد")).toBe("sinai_wadi");
  });

  it("٦ أكتوبر بتتحسب جيزة", () => {
    expect(zoneOfGovernorate("6th of October")).toBe("cairo_giza");
  });

  it("بيلاقي المحافظة جوّه عنوان كامل", () => {
    expect(zoneOfGovernorate("مدينة نصر، القاهرة")).toBe("cairo_giza");
    expect(zoneOfGovernorate("Cairo Cairo Egypt")).toBe("cairo_giza");
  });

  it("**اللي مش معروف بيرجع فاضي مش القاهرة**", () => {
    // لو حطّيناه على القاهرة افتراضيًا، شحنة سيناء بـ١٢٧ هتتحسب ٨١
    // ومحدش هياخد باله
    expect(zoneOfGovernorate("حاجة مش موجودة")).toBeNull();
    expect(zoneOfGovernorate("")).toBeNull();
    expect(zoneOfGovernorate(null)).toBeNull();
  });
});

describe("⚠️ الأرقام العربي في اسم المحافظة", () => {
  it("«٦ أكتوبر» بالأرقام العربي بتوصل لنفس المنطقة", () => {
    expect(normalizeGovernorate("٦ أكتوبر")).toBe("6اكتوبر");
    expect(normalizeGovernorate("٦ أكتوبر")).toBe(normalizeGovernorate("6 اكتوبر"));
  });

  it("والتشكيل لسه بيتمسح", () => {
    expect(normalizeGovernorate("القَاهِرَة")).toBe(normalizeGovernorate("القاهرة"));
  });
});
