import { describe, expect, it } from "vitest";
import {
  changeCount,
  desiredLines,
  discountPercent,
  duplicatedVariants,
  planOrderPush,
  readShopLines,
  type OurItem,
  type ShopLine,
} from "./order-push-plan";

/** بند شوبيفاي بالشكل الخام اللي بيجي من الـAPI */
const node = (
  svid: string | null,
  quantity: number,
  currentQuantity: number,
  base: number,
  effective = base
) => ({
  id: `gid://shopify/LineItem/${svid}-${quantity}-${currentQuantity}`,
  quantity,
  currentQuantity,
  variant: svid ? { legacyResourceId: svid } : null,
  originalUnitPriceSet: { shopMoney: { amount: String(base) } },
  discountedUnitPriceSet: { shopMoney: { amount: String(effective) } },
});

const item = (svid: string | null, quantity: number, salePrice: number): OurItem => ({
  shopifyVariantId: svid,
  quantity,
  salePrice,
});

const line = (
  svid: string,
  quantity: number,
  basePrice: number,
  effectivePrice = basePrice
): ShopLine => ({ shopifyVariantId: svid, quantity, basePrice, effectivePrice });

describe("توزيع خصم الأوردر على البنود", () => {
  it("من غير خصم السعر زي ما هو", () => {
    const d = desiredLines([item("A", 2, 100), item("B", 1, 50)], 0);
    expect(d.get("A")).toEqual({ qty: 2, price: 100 });
    expect(d.get("B")).toEqual({ qty: 1, price: 50 });
  });

  it("بيوزّع الخصم بالنسبة والتناسب", () => {
    // الإجمالي ٢٥٠، خصم ٢٥ يعني ١٠٪ على كل بند
    const d = desiredLines([item("A", 2, 100), item("B", 1, 50)], 25);
    expect(d.get("A")!.price).toBe(90);
    expect(d.get("B")!.price).toBe(45);
  });

  it("الخصم الأكبر من الإجمالي مابينزلش بالسعر تحت الصفر", () => {
    const d = desiredLines([item("A", 1, 100)], 500);
    expect(d.get("A")!.price).toBe(0);
  });

  it("الخصم السالب بيتعامل كصفر", () => {
    const d = desiredLines([item("A", 1, 100)], -50);
    expect(d.get("A")!.price).toBe(100);
  });

  it("نفس المنتج مرتين: الكمية بتتجمع", () => {
    const d = desiredLines([item("A", 1, 100), item("A", 2, 100)], 0);
    expect(d.get("A")).toEqual({ qty: 3, price: 100 });
  });

  it("المنتج اللي مالوش رقم عند شوبيفاي بيتشال", () => {
    const d = desiredLines([item(null, 1, 100), item("import-9", 1, 50)], 0);
    expect(d.size).toBe(0);
  });
});

describe("قرار التغيير", () => {
  it("كله مطابق يبقى مفيش تغيير", () => {
    const plan = planOrderPush([item("A", 2, 100)], [line("A", 2, 100)], 0);
    expect(changeCount(plan)).toBe(0);
  });

  it("الكمية مختلفة", () => {
    const plan = planOrderPush([item("A", 3, 100)], [line("A", 2, 100)], 0);
    expect(plan.onlyQty).toEqual([{ svid: "A", qty: 3 }]);
    expect(plan.priceFix).toEqual([]);
  });

  it("سعرنا أقل يبقى خصم", () => {
    const plan = planOrderPush([item("A", 1, 90)], [line("A", 1, 100)], 0);
    expect(plan.priceFix).toEqual([{ svid: "A", target: 90, base: 100 }]);
  });

  it("سعرنا أعلى من الكتالوج — شوبيفاي مابتسمحش", () => {
    const plan = planOrderPush([item("A", 1, 120)], [line("A", 1, 100)], 0);
    expect(plan.cantRaise).toEqual([{ svid: "A", system: 120, base: 100 }]);
    expect(plan.priceFix).toEqual([]);
    // **دي بالظبط اللي كانت بتخلّي القديمة تقول "مفيش فرق"**
    expect(changeCount(plan)).toBe(0);
  });

  it("فرق أقل من قرش مش فرق", () => {
    const plan = planOrderPush([item("A", 1, 100.005)], [line("A", 1, 100)], 0);
    expect(changeCount(plan)).toBe(0);
  });

  it("بند عندنا ومش عندهم يتضاف", () => {
    const plan = planOrderPush([item("A", 2, 100)], [], 0);
    expect(plan.toAdd).toEqual([{ svid: "A", qty: 2, price: 100 }]);
  });

  it("بند عندهم ومش عندنا يتشال", () => {
    const plan = planOrderPush([], [line("A", 1, 100)], 0);
    expect(plan.toRemove).toEqual(["A"]);
  });

  it("السعر بيتقارن بالسعر بعد الخصم مش قبله", () => {
    // شوبيفاي عليها خصم خلّى السعر ٩٠، وإحنا عايزين ٩٠ — يبقى تمام
    const plan = planOrderPush([item("A", 1, 90)], [line("A", 1, 100, 90)], 0);
    expect(changeCount(plan)).toBe(0);
  });
});

describe("قراءة بنود شوبيفاي", () => {
  it("بيقرا الكمية الحالية مش الأصلية", () => {
    // بند اتعدّل قبل كده: أصله ٢ وبقى ١
    const lines = readShopLines([node("A", 2, 1, 649)]);
    expect(lines).toEqual([
      { shopifyVariantId: "A", quantity: 1, basePrice: 649, effectivePrice: 649 },
    ]);
  });

  it("البند الملغي (كميته الحالية صفر) بيتشال", () => {
    expect(readShopLines([node("A", 2, 0, 649)])).toEqual([]);
  });

  it("بندين لنفس المنتج: الكميات بتتجمع", () => {
    // ده أوردر ١٣٧٤ الحقيقي: بند أصله ٢ بقى ١، وبند تاني اتضاف بـ١
    const lines = readShopLines([node("A", 2, 1, 649), node("A", 1, 1, 649)]);
    expect(lines).toEqual([
      { shopifyVariantId: "A", quantity: 2, basePrice: 649, effectivePrice: 649 },
    ]);
  });

  it("وضع القديمة: بيقرا الكمية الأصلية والبند التاني بيلغي الأول", () => {
    const lines = readShopLines([node("A", 2, 1, 649), node("A", 1, 1, 649)], {
      legacy: true,
    });
    // القديمة بتشوف كمية ١ بس — والحقيقة ٢
    expect(lines).toEqual([
      { shopifyVariantId: "A", quantity: 1, basePrice: 649, effectivePrice: 649 },
    ]);
  });

  it("البند اللي مالوش منتج بيتشال", () => {
    expect(readShopLines([node(null, 1, 1, 100)])).toEqual([]);
  });
});

describe("أوردر ١٣٧٤ — الفرق الوهمي اللي كان هيزوّد قطعة", () => {
  const nodes = [node("50361255002345", 2, 1, 649), node("50361255002345", 1, 1, 649)];
  const items = [item("50361255002345", 2, 649)];

  it("القديمة بتشوف فرق وهو مفيش", () => {
    const plan = planOrderPush(items, readShopLines(nodes, { legacy: true }), 0);
    expect(plan.onlyQty).toEqual([{ svid: "50361255002345", qty: 2 }]);
    // ولو نفّذت، كانت هتحط ٢ على بند من الاتنين فيبقى الأوردر ٣ قطع
    expect(changeCount(plan)).toBe(1);
  });

  it("الجديدة بتشوف الحقيقة: مفيش فرق", () => {
    const plan = planOrderPush(items, readShopLines(nodes), 0);
    expect(changeCount(plan)).toBe(0);
  });

  it("بنعرف البند المكرر عشان نوقف قبل ما نغلط", () => {
    expect(duplicatedVariants(nodes)).toEqual(["50361255002345"]);
    expect(duplicatedVariants([node("A", 1, 1, 100)])).toEqual([]);
  });
});

describe("حسبة نسبة الخصم", () => {
  it("بتوصّل من سعر الكتالوج للسعر المطلوب", () => {
    expect(discountPercent(649, 600)).toBeCloseTo(7.5501, 4);
    expect(discountPercent(100, 90)).toBe(10);
    expect(discountPercent(100, 100)).toBe(0);
  });

  it("الخصم بيتحسب من سعر الكتالوج دايمًا مش من السعر الحالي", () => {
    // ده أصل باج التراكم: ٦٤٩ ثم ٦٠٠ ثم ٥٠٢. لو حسبنا من السعر الحالي
    // كل مرة، الخصم بيتراكم. الحسبة دايمًا من الأصل.
    const base = 649;
    expect(base * (1 - discountPercent(base, 600) / 100)).toBeCloseTo(600, 2);
    expect(base * (1 - discountPercent(base, 502) / 100)).toBeCloseTo(502, 2);
  });
});
