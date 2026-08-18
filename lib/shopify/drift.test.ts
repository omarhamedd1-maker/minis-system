import { describe, expect, it } from "vitest";
import { findDrift, ourTotal, type OurOrderTotal } from "./drift";

const ours = (over: Partial<OurOrderTotal> = {}): OurOrderTotal => ({
  orderNumber: "1001",
  orderStatus: "delivered",
  itemsTotal: 1000,
  discount: 0,
  shipping: 90,
  bostaCod: null,
  bostaCollected: false,
  ...over,
});

const shop = (total: number, cancelled = false) => ({
  orderNumber: "1001",
  cancelled,
  total,
});

describe("إجمالي الأوردر عندنا", () => {
  it("بنود ناقص خصم زائد شحن", () => {
    expect(ourTotal(ours({ itemsTotal: 1000, discount: 100, shipping: 90 }))).toBe(990);
  });
});

describe("الفرق مع شوبيفاي", () => {
  it("المتطابق مابيتعرضش", () => {
    expect(findDrift([ours()], [shop(1090)])).toEqual([]);
  });

  it("**فرق جنيه مابيتحسبش** — ده تقريب شوبيفاي", () => {
    expect(findDrift([ours()], [shop(1090.5)])).toEqual([]);
  });

  it("الفرق الحقيقي بيتعرض بالاتجاه", () => {
    const [r] = findDrift([ours()], [shop(900)]);
    expect(r.ours).toBe(1090);
    expect(r.shopify).toBe(900);
    expect(r.diff).toBe(190);
  });

  it("**الملغي عند شوبيفاي بيتخطّى** — إجماليه بيبقى صفر فالفرق وهمي", () => {
    expect(findDrift([ours()], [shop(0, true)])).toEqual([]);
  });

  it("والملغي عندنا كمان", () => {
    expect(findDrift([ours({ orderStatus: "cancelled" })], [shop(1)])).toEqual([]);
  });

  it("اللي مش عند شوبيفاي أصلًا بيتخطّى", () => {
    expect(findDrift([ours({ orderNumber: "9999" })], [shop(1)])).toEqual([]);
  });
});

describe("**الفلوس اللي اتحصّلت هي الحكم**", () => {
  it("بوسطة حصّلت زي شوبيفاي → شوبيفاي الصح", () => {
    const [r] = findDrift(
      [ours({ bostaCod: 739, bostaCollected: true })],
      [shop(739)]
    );
    expect(r.matches).toBe("shopify");
    expect(r.collected).toBe(739);
  });

  it("بوسطة حصّلت زينا → **إحنا الصح وشوبيفاي هي القديمة**", () => {
    const [r] = findDrift(
      [ours({ itemsTotal: 3600, shipping: 90, bostaCod: 3690, bostaCollected: true })],
      [shop(3984)]
    );
    expect(r.matches).toBe("ours");
  });

  it("مامطابقش لا ده ولا ده", () => {
    const [r] = findDrift(
      [ours({ bostaCod: 500, bostaCollected: true })],
      [shop(900)]
    );
    expect(r.matches).toBe("neither");
  });

  it("**الشحنة مش متحصّلة؟ الفرق بيتعرض من غير حكم** — الرقم لسه مش نهائي", () => {
    const [r] = findDrift(
      [ours({ bostaCod: 739, bostaCollected: false })],
      [shop(739)]
    );
    expect(r.matches).toBe("unknown");
    expect(r.collected).toBeNull();
  });

  it("متحصّلة بصفر مابتحكمش", () => {
    const [r] = findDrift(
      [ours({ bostaCod: 0, bostaCollected: true })],
      [shop(900)]
    );
    expect(r.matches).toBe("unknown");
    expect(r.collected).toBeNull();
  });
});

describe("الترتيب", () => {
  it("الأكبر فرقًا الأول", () => {
    const rows = findDrift(
      [
        ours({ orderNumber: "1", itemsTotal: 100, shipping: 0 }),
        ours({ orderNumber: "2", itemsTotal: 100, shipping: 0 }),
      ],
      [
        { orderNumber: "1", cancelled: false, total: 90 },
        { orderNumber: "2", cancelled: false, total: 1000 },
      ]
    );
    expect(rows.map((r) => r.orderNumber)).toEqual(["2", "1"]);
  });
});
