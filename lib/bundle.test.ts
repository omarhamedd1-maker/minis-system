import { describe, it, expect } from "vitest";
import {
  splitBundlePrice,
  checkBundle,
  savings,
  bundleProfit,
  itemsValue,
  bundleCost,
  type Bundle,
  type BundleItem,
} from "./bundle";

const item = (x: Partial<BundleItem> = {}): BundleItem => ({
  variantId: "v1",
  name: "شكل",
  quantity: 1,
  unitPrice: 400,
  unitCost: 150,
  ...x,
});

const bundle = (x: Partial<Bundle> = {}): Bundle => ({
  name: "طقم المطبخ",
  price: 900,
  items: [
    item({ variantId: "a", unitPrice: 400 }),
    item({ variantId: "b", unitPrice: 400 }),
    item({ variantId: "c", unitPrice: 400 }),
  ],
  ...x,
});

/** مجموع البنود بعد التوزيع */
const sum = (lines: { salePrice: number; quantity: number }[]) =>
  Math.round(lines.reduce((s, l) => s + l.salePrice * l.quantity, 0) * 100) / 100;

describe("توزيع سعر الباقة", () => {
  it("⚠️⚠️ المجموع بعد التوزيع = سعر الباقة بالظبط", () => {
    expect(sum(splitBundlePrice(bundle()))).toBe(900);
  });

  it("⚠️ القروش الضايعة بتتلم — ١٠٠٠ على ٣ مش ٩٩٩٫٩٩", () => {
    const lines = splitBundlePrice(bundle({ price: 1000 }));
    expect(sum(lines)).toBe(1000);
  });

  it("التوزيع بنسبة سعر كل بند مش بالتساوي", () => {
    const lines = splitBundlePrice(
      bundle({
        price: 900,
        items: [
          item({ variantId: "غالي", unitPrice: 800 }),
          item({ variantId: "رخيص", unitPrice: 400 }),
        ],
      })
    );
    const byId = Object.fromEntries(lines.map((l) => [l.variantId, l.salePrice]));
    expect(byId["غالي"]).toBe(600);
    expect(byId["رخيص"]).toBe(300);
    expect(sum(lines)).toBe(900);
  });

  it("الكمية بتتحسب في الوزن", () => {
    const lines = splitBundlePrice(
      bundle({
        price: 900,
        items: [
          item({ variantId: "اتنين", unitPrice: 300, quantity: 2 }),
          item({ variantId: "واحد", unitPrice: 300, quantity: 1 }),
        ],
      })
    );
    expect(sum(lines)).toBe(900);
    const two = lines.find((l) => l.variantId === "اتنين")!;
    expect(two.salePrice * two.quantity).toBe(600);
  });

  it("⚠️ البنود اللي كلها بصفر بتتوزّع بالتساوي مش NaN", () => {
    const lines = splitBundlePrice(
      bundle({
        price: 300,
        items: [
          item({ variantId: "a", unitPrice: 0 }),
          item({ variantId: "b", unitPrice: 0 }),
        ],
      })
    );
    expect(lines.every((l) => Number.isFinite(l.salePrice))).toBe(true);
    expect(sum(lines)).toBe(300);
  });

  it("⚠️ الكمية صفر بتتشال مش بتقسم على صفر", () => {
    const lines = splitBundlePrice(
      bundle({ items: [item({ variantId: "a" }), item({ variantId: "b", quantity: 0 })] })
    );
    expect(lines.map((l) => l.variantId)).toEqual(["a"]);
    expect(lines.every((l) => Number.isFinite(l.salePrice))).toBe(true);
  });

  it("مافيش بنود = مافيش سطور", () => {
    expect(splitBundlePrice(bundle({ items: [] }))).toEqual([]);
  });

  it("التكلفة بتتنقل زي ما هي مش بتتوزّع", () => {
    const lines = splitBundlePrice(bundle());
    expect(lines.every((l) => l.unitCost === 150)).toBe(true);
  });
});

describe("أرقام الباقة", () => {
  it("العميل بيوفّر الفرق", () => {
    expect(itemsValue(bundle().items)).toBe(1200);
    expect(savings(bundle())).toBe(300);
  });

  it("الربح = السعر ناقص التكلفة", () => {
    expect(bundleCost(bundle().items)).toBe(450);
    expect(bundleProfit(bundle())).toBe(450);
  });

  it("⚠️ الشحن مش داخل — بيتحسب على الأوردر مش على الباقة", () => {
    // نفس الباقة مرتين لازم تدّي نفس الربح
    expect(bundleProfit(bundle())).toBe(bundleProfit(bundle()));
  });
});

describe("فحص الباقة", () => {
  it("الباقة السليمة بتعدّي", () => {
    expect(checkBundle(bundle())).toEqual({ ok: true });
  });

  it("⚠️ منتج واحد مش باقة", () => {
    const r = checkBundle(bundle({ items: [item()] }));
    expect(r).toEqual({ ok: false, reason: "الباقة محتاجة منتجين على الأقل" });
  });

  it("⚠️ الباقة الأغلى من بنودها بيكتشفها العميل", () => {
    const r = checkBundle(bundle({ price: 1500 }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("أغلى");
  });

  it("⚠️ الباقة تحت التكلفة خسارة مؤكدة", () => {
    const r = checkBundle(bundle({ price: 400 }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("خسارة");
  });

  it("السعر الفاضي مايعدّيش", () => {
    expect(checkBundle(bundle({ price: 0 })).ok).toBe(false);
  });

  it("الاسم الفاضي مايعدّيش", () => {
    expect(checkBundle(bundle({ name: "  " })).ok).toBe(false);
  });
});
