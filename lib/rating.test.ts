import { describe, it, expect } from "vitest";
import {
  ratingsByProduct,
  overallRating,
  checkStars,
  starsText,
  ratingLink,
  MIN_RATINGS,
  LOW_STARS,
  type Rating,
} from "./rating";

const r = (x: Partial<Rating> = {}): Rating => ({
  orderId: "o1",
  stars: 5,
  comment: null,
  variantIds: ["v1"],
  createdAt: "2026-08-26T10:00:00Z",
  ...x,
});

const many = (n: number, stars: number, variantIds = ["v1"]) =>
  Array.from({ length: n }, (_, i) =>
    r({ orderId: `o${i}`, stars, variantIds })
  );

describe("فحص النجوم", () => {
  it("من ١ لـ٥ بس", () => {
    expect(checkStars(1)).toBe(1);
    expect(checkStars(5)).toBe(5);
    expect(checkStars(0)).toBeNull();
    expect(checkStars(6)).toBeNull();
    expect(checkStars(-1)).toBeNull();
  });

  it("⚠️ الكسر بيتقرّب مش بيترفض", () => {
    expect(checkStars(4.4)).toBe(4);
    expect(checkStars("3")).toBe(3);
  });

  it("اللي مش رقم بيترفض", () => {
    expect(checkStars("كويس")).toBeNull();
    expect(checkStars(null)).toBeNull();
    expect(checkStars(NaN)).toBeNull();
  });
});

describe("متوسط المنتج", () => {
  it("بيحسب المتوسط", () => {
    const rows = ratingsByProduct([
      ...many(2, 5),
      ...many(2, 3, ["v1"]).map((x) => ({ ...x, orderId: x.orderId + "b" })),
    ]);
    expect(rows[0]).toMatchObject({ variantId: "v1", average: 4, count: 4 });
  });

  it("⚠️⚠️ المتوسط مابيتعرضش تحت الحد — تقييم واحد بنجمة بيخوّف وهو مالوش معنى", () => {
    const rows = ratingsByProduct(many(MIN_RATINGS - 1, 1));
    expect(rows[0].average).toBeNull();
    expect(rows[0].count).toBe(MIN_RATINGS - 1);
  });

  it("⚠️⚠️ الأوردر بيقيّم كل أشكاله بنفس النجوم", () => {
    const rows = ratingsByProduct(many(3, 4, ["a", "b"]));
    expect(rows.map((x) => x.variantId).sort()).toEqual(["a", "b"]);
    expect(rows.every((x) => x.average === 4)).toBe(true);
  });

  it("⚠️ الأقل تقييمًا الأول — ده اللي محتاج نظرة", () => {
    const rows = ratingsByProduct([
      ...many(3, 5, ["كويس"]),
      ...many(3, 2, ["وحش"]),
    ]);
    expect(rows[0].variantId).toBe("وحش");
  });

  it("⚠️ اللي مالوش متوسط بينزل تحت مش بيتصدّر بصفر", () => {
    const rows = ratingsByProduct([
      ...many(3, 2, ["ليه متوسط"]),
      ...many(1, 1, ["قليل"]),
    ]);
    expect(rows[0].variantId).toBe("ليه متوسط");
    expect(rows.at(-1)!.variantId).toBe("قليل");
  });

  it("بيعدّ اللي تحت الحد", () => {
    const rows = ratingsByProduct([...many(2, 1), ...many(2, 5)]);
    expect(rows[0].low).toBe(2);
  });

  it("التقييم الغلط بيتشال", () => {
    const rows = ratingsByProduct([r({ stars: 9 }), ...many(3, 4)]);
    expect(rows[0].count).toBe(3);
  });

  it("الشكل الفاضي بيتشال", () => {
    expect(ratingsByProduct([r({ variantIds: [""] })])).toEqual([]);
    expect(ratingsByProduct([r({ variantIds: [] })])).toEqual([]);
  });

  it("مافيش تقييمات = فاضي من غير قسمة على صفر", () => {
    expect(ratingsByProduct([])).toEqual([]);
  });
});

describe("المتوسط العام", () => {
  it("بيحسب المتوسط والنسبة", () => {
    const o = overallRating([...many(8, 5), ...many(2, 1)]);
    expect(o.count).toBe(10);
    expect(o.average).toBe(4.2);
    expect(o.low).toBe(2);
    expect(o.lowRate).toBe(20);
  });

  it("⚠️ تحت الحد مافيش متوسط ولا نسبة", () => {
    const o = overallRating(many(MIN_RATINGS - 1, 5));
    expect(o.average).toBeNull();
    expect(o.lowRate).toBeNull();
    expect(o.count).toBe(MIN_RATINGS - 1);
  });

  it("مافيش تقييمات = صفر من غير قسمة على صفر", () => {
    expect(overallRating([])).toMatchObject({
      average: null,
      count: 0,
      low: 0,
      lowRate: null,
    });
  });

  it("الحد المنخفض معقول", () => {
    expect(LOW_STARS).toBeGreaterThan(1);
    expect(LOW_STARS).toBeLessThan(5);
  });
});

describe("العرض واللينك", () => {
  it("النجوم", () => {
    expect(starsText(5)).toBe("★★★★★");
    expect(starsText(3)).toBe("★★★☆☆");
    expect(starsText(0)).toBe("☆☆☆☆☆");
  });

  it("النجوم بتتحدّ من فوق ومن تحت", () => {
    expect(starsText(99)).toBe("★★★★★");
    expect(starsText(-5)).toBe("☆☆☆☆☆");
  });

  it("⚠️ اللينك بمعرّف الأوردر مش برقمه — الرقم متسلسل وينفع يتخمّن", () => {
    const id = "3f2b1c8e-0000-4000-8000-000000000001";
    expect(ratingLink(id, "https://x.com")).toBe(`https://x.com/r/${id}`);
    expect(ratingLink(id, "https://x.com/")).toBe(`https://x.com/r/${id}`);
  });

  it("⚠️ المعرّف الفاضي بيرجّع null مش لينك مكسور", () => {
    expect(ratingLink(null)).toBeNull();
    expect(ratingLink("  ")).toBeNull();
  });

  it("⚠️ العنوان الفاضي بيرجع للدومين الأساسي — زي trackingLink بالظبط", () => {
    expect(ratingLink("abc")).toBe("https://minis-system.vercel.app/r/abc");
    expect(ratingLink("abc", null)).toBe("https://minis-system.vercel.app/r/abc");
  });
});
