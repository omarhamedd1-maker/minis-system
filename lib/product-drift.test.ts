import { describe, it, expect } from "vitest";
import {
  productDrift,
  driftMessage,
  MIN_ORDERS,
  type SaleRow,
} from "./product-drift";

const NOW = new Date("2026-08-20T12:00:00Z");
const dayBack = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** بيعات لشكل معيّن في يوم معيّن */
function sales(
  variantId: string,
  daysAgo: number,
  total: number,
  returned: number
): SaleRow[] {
  return Array.from({ length: total }, (_, i) => ({
    variantId,
    productName: "تيشيرت",
    variantName: "لارج",
    day: dayBack(daysAgo),
    returned: i < returned,
  }));
}

describe("المنتج اللي اتغيّر سلوكه", () => {
  it("القفزة بتتمسك", () => {
    const rows = [
      ...sales("v1", 45, 20, 1), // 5%
      ...sales("v1", 10, 20, 6), // 30%
    ];
    const [d] = productDrift(rows, NOW);
    expect(d).toMatchObject({ variantId: "v1", before: 5, now: 30, jump: 25 });
  });

  it("⚠️ الثابت مايتنبّهش عليه حتى لو نسبته عالية", () => {
    const rows = [
      ...sales("v1", 45, 20, 6), // 30%
      ...sales("v1", 10, 20, 6), // 30%
    ];
    expect(productDrift(rows, NOW)).toEqual([]);
  });

  it("⚠️ اللي اتحسّن مش تنبيه", () => {
    const rows = [...sales("v1", 45, 20, 8), ...sales("v1", 10, 20, 1)];
    expect(productDrift(rows, NOW)).toEqual([]);
  });

  it("⚠️ الأرقام الصغيرة بتتشال مش بتتقارن", () => {
    const few = MIN_ORDERS - 1;
    const rows = [
      ...sales("v1", 45, few, 0),
      ...sales("v1", 10, few, few), // 100% بس على أرقام صغيرة
    ];
    expect(productDrift(rows, NOW)).toEqual([]);
  });

  it("⚠️ فترة واحدة مليانة والتانية فاضية = مفيش مقارنة", () => {
    const rows = [...sales("v1", 10, 30, 20)];
    expect(productDrift(rows, NOW)).toEqual([]);
  });

  it("الفرق الصغير مش تغيّر", () => {
    const rows = [
      ...sales("v1", 45, 20, 2), // 10%
      ...sales("v1", 10, 20, 3), // 15%
    ];
    expect(productDrift(rows, NOW)).toEqual([]);
  });

  it("الأسوأ الأول", () => {
    const rows = [
      ...sales("صغير", 45, 20, 2),
      ...sales("صغير", 10, 20, 5), // +15
      ...sales("كبير", 45, 20, 0),
      ...sales("كبير", 10, 20, 8), // +40
    ];
    expect(productDrift(rows, NOW).map((d) => d.variantId)).toEqual([
      "كبير",
      "صغير",
    ]);
  });

  it("⚠️ اللي برّه الفترتين مايدخلش الحسبة", () => {
    const rows = [
      ...sales("v1", 200, 50, 50), // قديم جدًا
      ...sales("v1", 45, 20, 1),
      ...sales("v1", 10, 20, 6),
    ];
    const [d] = productDrift(rows, NOW);
    expect(d.beforeCount).toBe(20);
    expect(d.nowCount).toBe(20);
  });

  it("الأشكال بتتحسب كل واحد لوحده", () => {
    const rows = [
      ...sales("لارج", 45, 20, 1),
      ...sales("لارج", 10, 20, 6),
      ...sales("سمول", 45, 20, 1),
      ...sales("سمول", 10, 20, 1),
    ];
    expect(productDrift(rows, NOW).map((d) => d.variantId)).toEqual(["لارج"]);
  });

  it("الشكل الفاضي والتاريخ الغلط بيتشالوا من غير ما يرموا", () => {
    const bad: SaleRow[] = [
      { variantId: null, productName: null, variantName: null, day: dayBack(5), returned: true },
      { variantId: "v1", productName: null, variantName: null, day: null, returned: true },
      { variantId: "v1", productName: null, variantName: null, day: "مش تاريخ", returned: false },
    ];
    expect(() => productDrift(bad, NOW)).not.toThrow();
    expect(productDrift(bad, NOW)).toEqual([]);
  });

  it("مافيش بيعات = مفيش تنبيه ومفيش قسمة على صفر", () => {
    expect(productDrift([], NOW)).toEqual([]);
  });

  it("⚠️ الرسالة بتقول الرقم والفرق من غير ما تقول اعمل إيه", () => {
    const rows = [...sales("v1", 45, 20, 1), ...sales("v1", 10, 20, 6)];
    const text = driftMessage(productDrift(rows, NOW)[0]);
    expect(text).toContain("5%");
    expect(text).toContain("30%");
    expect(text).toContain("تيشيرت");
    expect(text).not.toContain("لازم");
    expect(text).not.toContain("اعمل");
  });
});
