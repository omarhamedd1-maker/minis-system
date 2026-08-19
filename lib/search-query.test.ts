import { describe, it, expect } from "vitest";
import { planSearch, digitsOnly, toEnglishDigits } from "./search-query";

describe("خطة البحث", () => {
  it("الرقم القصير = رقم أوردر", () => {
    const p = planSearch("1367")!;
    expect(p.orderNumber).toBe(true);
    expect(p.phone).toBe(false);
    expect(p.name).toBe(false);
  });

  it("الرقم الطويل بيتجرّب تليفون وتتبع مع بعض", () => {
    const p = planSearch("01001234567")!;
    expect(p.phone).toBe(true);
    expect(p.tracking).toBe(true);
    expect(p.orderNumber).toBe(false);
  });

  it("النص = بحث بالاسم", () => {
    const p = planSearch("مروة")!;
    expect(p.name).toBe(true);
    expect(p.orderNumber).toBe(false);
    expect(p.phone).toBe(false);
  });

  it("⚠️ التليفون بأشكاله كلها بيطلع رقم واحد", () => {
    for (const form of ["0100 123 4567", "+20 100 123 4567", "٠١٠٠١٢٣٤٥٦٧", "0100-123-4567"]) {
      const p = planSearch(form)!;
      expect(p.phone).toBe(true);
      expect(p.digits.endsWith("1001234567")).toBe(true);
    }
  });

  it("الأرقام العربي بتتحوّل", () => {
    expect(toEnglishDigits("١٣٦٧")).toBe("1367");
    expect(digitsOnly("أوردر ١٣٦٧")).toBe("1367");
  });

  it("رقم عربي قصير برضه رقم أوردر", () => {
    const p = planSearch("١٣٦٧")!;
    expect(p.orderNumber).toBe(true);
    expect(p.digits).toBe("1367");
  });

  it("الحرف الواحد مابيبحتش بالاسم", () => {
    expect(planSearch("م")!.name).toBe(false);
  });

  it("الفاضي بيرجّع فاضي", () => {
    expect(planSearch("")).toBeNull();
    expect(planSearch("   ")).toBeNull();
    expect(planSearch(null)).toBeNull();
  });

  it("المسافات الزيادة بتتشال", () => {
    expect(planSearch("  مروة   شهاب ")!.text).toBe("مروة شهاب");
  });

  it("الاسم اللي فيه رقم بيفضل بحث بالاسم", () => {
    const p = planSearch("مقبض 2")!;
    expect(p.name).toBe(true);
    expect(p.orderNumber).toBe(false);
  });
});
