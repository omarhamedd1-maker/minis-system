import { describe, expect, it } from "vitest";
import {
  importChangeCount,
  planProductImport,
  type OurProductIn,
  type OurVariantIn,
  type ShopifyProductIn,
} from "./product-import-plan";

const sp = (
  productId: string,
  title: string,
  variants: { id: string; title?: string | null; price: number }[]
): ShopifyProductIn => ({
  productId,
  title,
  variants: variants.map((v) => ({
    variantId: v.id,
    title: v.title ?? "Default Title",
    sku: null,
    price: v.price,
  })),
});

const ourP = (id: string, shopifyProductId: string | null, name: string): OurProductIn => ({
  id,
  shopifyProductId,
  name,
});

const ourV = (
  id: string,
  productId: string,
  shopifyVariantId: string | null,
  salePrice: number,
  costPrice: number,
  name: string | null = null
): OurVariantIn => ({
  id,
  productId,
  shopifyVariantId,
  name,
  salePrice,
  costPrice,
});

describe("منتج جديد عند شوبيفاي", () => {
  it("بيتحط في الجديد بكل أشكاله", () => {
    const plan = planProductImport(
      [sp("P1", "كرسي", [{ id: "V1", price: 1200 }, { id: "V2", title: "أحمر", price: 1300 }])],
      [],
      []
    );
    expect(plan.newProducts).toHaveLength(1);
    expect(plan.newProducts[0].variants).toHaveLength(2);
    // الاتنين هيقعوا بتكلفة صفر — لازم العميل يعرف
    expect(plan.newNeedingCost).toBe(2);
    expect(importChangeCount(plan)).toBe(1);
  });
});

describe("شكل جديد لمنتج موجود", () => {
  it("بيتحط في أشكال جديدة مش منتجات جديدة", () => {
    const plan = planProductImport(
      [sp("P1", "كرسي", [{ id: "V1", price: 1200 }, { id: "V2", title: "أحمر", price: 1300 }])],
      [ourP("our-p1", "P1", "كرسي")],
      [ourV("our-v1", "our-p1", "V1", 1200, 700)]
    );
    expect(plan.newProducts).toEqual([]);
    expect(plan.newVariants).toHaveLength(1);
    expect(plan.newVariants[0].variant.variantId).toBe("V2");
    expect(plan.newVariants[0].ourProductId).toBe("our-p1");
    expect(plan.newNeedingCost).toBe(1);
  });
});

describe("السعر", () => {
  it("اتغيّر عند شوبيفاي يبقى بنقوله", () => {
    const plan = planProductImport(
      [sp("P1", "كرسي", [{ id: "V1", price: 1400 }])],
      [ourP("our-p1", "P1", "كرسي")],
      [ourV("our-v1", "our-p1", "V1", 1200, 700)]
    );
    expect(plan.priceChanged).toEqual([
      { ourVariantId: "our-v1", name: "كرسي", ours: 1200, shopify: 1400 },
    ]);
  });

  it("فرق أقل من قرش مش فرق", () => {
    const plan = planProductImport(
      [sp("P1", "كرسي", [{ id: "V1", price: 1200.005 }])],
      [ourP("our-p1", "P1", "كرسي")],
      [ourV("our-v1", "our-p1", "V1", 1200, 700)]
    );
    expect(plan.priceChanged).toEqual([]);
  });
});

describe("الناقص — التكلفة", () => {
  it("**أهم حاجة**: اللي تكلفته صفر بيتقال", () => {
    const plan = planProductImport(
      [sp("P1", "كرسي", [{ id: "V1", price: 1200 }])],
      [ourP("our-p1", "P1", "كرسي")],
      [ourV("our-v1", "our-p1", "V1", 1200, 0)]
    );
    expect(plan.needsCost).toEqual([
      { ourVariantId: "our-v1", name: "كرسي", salePrice: 1200 },
    ]);
  });

  it("اللي ليه تكلفة مابيظهرش", () => {
    const plan = planProductImport(
      [sp("P1", "كرسي", [{ id: "V1", price: 1200 }])],
      [ourP("our-p1", "P1", "كرسي")],
      [ourV("our-v1", "our-p1", "V1", 1200, 700)]
    );
    expect(plan.needsCost).toEqual([]);
  });

  it("المنتج اللي اتكتب بإيد وتكلفته صفر بيظهر برضه", () => {
    const plan = planProductImport(
      [],
      [ourP("our-p2", null, "منتج يدوي")],
      [ourV("our-v2", "our-p2", null, 500, 0)]
    );
    expect(plan.needsCost).toHaveLength(1);
    expect(plan.needsCost[0].name).toBe("منتج يدوي");
  });
});

describe("الأسماء", () => {
  it('"Default Title" مابتتحطش في الاسم', () => {
    const plan = planProductImport(
      [sp("P1", "كرسي", [{ id: "V1", price: 1200 }])],
      [ourP("our-p1", "P1", "كرسي")],
      [ourV("our-v1", "our-p1", "V1", 1200, 0, "Default Title")]
    );
    expect(plan.needsCost[0].name).toBe("كرسي");
  });

  it("الشكل بيتلزق بالاسم", () => {
    const plan = planProductImport(
      [],
      [ourP("our-p1", "P1", "كرسي")],
      [ourV("our-v1", "our-p1", "V1", 1200, 0, "أحمر")]
    );
    expect(plan.needsCost[0].name).toBe("كرسي — أحمر");
  });
});

describe("عندنا ومش عندهم", () => {
  it("بنقول بس، مابنمسحش", () => {
    const plan = planProductImport(
      [],
      [ourP("our-p1", "P1", "كرسي قديم")],
      [ourV("our-v1", "our-p1", "V-OLD", 1200, 700)]
    );
    expect(plan.onlyHere).toEqual([
      { ourVariantId: "our-v1", name: "كرسي قديم" },
    ]);
    // مفيش حاجة تتعمل — دي معلومة مش إجراء
    expect(importChangeCount(plan)).toBe(0);
  });

  it("المنتج اليدوي مش بيتحسب ناقص من شوبيفاي", () => {
    const plan = planProductImport(
      [],
      [ourP("our-p2", null, "منتج يدوي")],
      [ourV("our-v2", "our-p2", null, 500, 300)]
    );
    expect(plan.onlyHere).toEqual([]);
  });
});

describe("مافيش تغيير", () => {
  it("كله مطابق", () => {
    const plan = planProductImport(
      [sp("P1", "كرسي", [{ id: "V1", price: 1200 }])],
      [ourP("our-p1", "P1", "كرسي")],
      [ourV("our-v1", "our-p1", "V1", 1200, 700)]
    );
    expect(importChangeCount(plan)).toBe(0);
    expect(plan.priceChanged).toEqual([]);
    expect(plan.needsCost).toEqual([]);
    expect(plan.onlyHere).toEqual([]);
  });
});
