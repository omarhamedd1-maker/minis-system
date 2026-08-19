import { describe, it, expect } from "vitest";
import { trackView } from "./tracking-view";

describe("صفحة التتبع", () => {
  it("بتقول للعميل حالته بالعربي", () => {
    expect(trackView("out_for_delivery").headline).toContain("المندوب");
    expect(trackView("delivered").headline).toContain("اتسلّم");
  });

  it("الخطوات اللي عدّت بتتعلّم", () => {
    const v = trackView("shipped");
    expect(v.steps.map((s) => s.done)).toEqual([true, true, false, false, false]);
    expect(v.steps.filter((s) => s.current)).toHaveLength(1);
  });

  it("المسلّم كل خطواته عدّت", () => {
    const v = trackView("delivered");
    expect(v.steps.slice(0, 4).every((s) => s.done)).toBe(true);
    expect(v.finished).toBe(true);
  });

  it("⚠️ الراجع مافيش خطوة حالية — الرحلة وقفت", () => {
    for (const s of ["returning", "returned", "cancelled"]) {
      expect(trackView(s).steps.some((x) => x.current)).toBe(false);
    }
  });

  it("اللي لسه ماشي مش خالص", () => {
    expect(trackView("shipped").finished).toBe(false);
    expect(trackView("returned").finished).toBe(true);
  });

  it("⚠️ الحالة المجهولة بتدّي كلام محايد مش «حالة غير معروفة»", () => {
    const v = trackView("حاجة_جديدة");
    expect(v.headline).toContain("في السكة");
    expect(v.headline).not.toContain("غير معروف");
    expect(v.steps).toHaveLength(5);
  });

  it("الفاضي مابيوقعش", () => {
    expect(() => trackView(null)).not.toThrow();
    expect(trackView("").steps).toHaveLength(5);
  });

  it("⚠️ مافيش أي بيانات شخصية في اللي بيترجع", () => {
    const v = trackView("delivered");
    const text = JSON.stringify(v);
    for (const bad of ["phone", "address", "cod", "price", "تليفون", "عنوان"]) {
      expect(text).not.toContain(bad);
    }
  });
});
