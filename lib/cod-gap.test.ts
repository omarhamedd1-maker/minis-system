import { describe, it, expect } from "vitest";
import { codGaps, type GapOrder } from "./cod-gap";

const o = (x: Partial<GapOrder> = {}): GapOrder => ({
  orderNumber: "1142",
  orderStatus: "shipped",
  bostaCod: 2450,
  bostaCollected: false,
  itemsTotal: 1960,
  discount: 0,
  shipping: 90,
  ...x,
});

describe("فرق التحصيل", () => {
  it("بيحسب الفرق بين رقمنا وبوسطة", () => {
    const r = codGaps([o()]);
    expect(r.rows[0]).toMatchObject({ ours: 2050, bosta: 2450, diff: 400 });
    expect(r.total).toBe(400);
  });

  it("الفرق بالسالب برضه فرق", () => {
    const r = codGaps([o({ bostaCod: 1270, itemsTotal: 1298 })]);
    expect(r.rows[0].diff).toBe(-118);
    expect(r.total).toBe(118);
  });

  it("المطابق مايظهرش", () => {
    expect(codGaps([o({ bostaCod: 2050 })]).rows).toEqual([]);
  });

  it("فرق جنيه أو أقل تقريب مش مشكلة", () => {
    expect(codGaps([o({ bostaCod: 2051 })]).rows).toEqual([]);
  });

  it("⚠️ الشحنة اللي مالهاش تحصيل مش فرق", () => {
    expect(codGaps([o({ bostaCod: 0 }), o({ bostaCod: null })]).rows).toEqual([]);
  });

  it("⚠️ اللي اتحصّل أو خلص مش قابل للتظبيط", () => {
    const r = codGaps([
      o({ orderNumber: "a", bostaCollected: true }),
      o({ orderNumber: "b", orderStatus: "delivered" }),
      o({ orderNumber: "c", orderStatus: "shipped" }),
    ]);
    expect(r.fixable).toBe(1);
    expect(r.rows.find((x) => x.orderNumber === "c")?.fixable).toBe(true);
  });

  it("الأكبر فرقًا الأول", () => {
    const r = codGaps([
      o({ orderNumber: "صغير", bostaCod: 2100 }),
      o({ orderNumber: "كبير", bostaCod: 3050 }),
    ]);
    expect(r.rows.map((x) => x.orderNumber)).toEqual(["كبير", "صغير"]);
  });

  it("الخصم والشحن داخلين في رقمنا", () => {
    const r = codGaps([
      o({ itemsTotal: 2000, discount: 100, shipping: 90, bostaCod: 2500 }),
    ]);
    expect(r.rows[0].ours).toBe(1990);
  });

  it("مافيش أوردرات = تقرير فاضي", () => {
    const r = codGaps([]);
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.fixable).toBe(0);
  });
});
