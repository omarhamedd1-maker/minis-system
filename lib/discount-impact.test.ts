import { describe, it, expect } from "vitest";
import {
  discountImpact,
  discountVerdict,
  MIN_ORDERS_PER_GROUP,
  type DiscountOrder,
} from "./discount-impact";

const order = (o: Partial<DiscountOrder>): DiscountOrder => ({
  orderStatus: "delivered",
  itemsTotal: 1000,
  discount: 0,
  shipping: 0,
  ...o,
});

/** مجموعة أوردرات متشابهة */
const many = (n: number, o: Partial<DiscountOrder>) =>
  Array.from({ length: n }, () => order(o));

describe("أثر الخصم", () => {
  it("⚠️ الإجمالي هو اللي العميل دفعه، مش قيمة البضاعة", () => {
    const r = discountImpact([order({ itemsTotal: 1000, discount: 200, shipping: 50 })]);
    expect(r.withDiscount.revenue).toBe(850);
    expect(r.withDiscount.discount).toBe(200);
  });

  it("بيفصل اللي فيه خصم عن اللي من غير", () => {
    const r = discountImpact([
      ...many(6, { discount: 100 }),
      ...many(6, { discount: 0 }),
    ]);
    expect(r.withDiscount.orders).toBe(6);
    expect(r.without.orders).toBe(6);
    expect(r.comparable).toBe(true);
  });

  it("⚠️ الملغي بره الحسبة", () => {
    const r = discountImpact([
      order({ orderStatus: "cancelled", discount: 500 }),
      order({ discount: 100 }),
    ]);
    expect(r.withDiscount.orders).toBe(1);
    expect(r.withDiscount.discount).toBe(100);
  });

  it("نسبة الرجوع على اللي خلص مشواره بس", () => {
    const r = discountImpact([
      ...many(3, { discount: 100, orderStatus: "delivered" }),
      ...many(1, { discount: 100, orderStatus: "returned" }),
      ...many(2, { discount: 100, orderStatus: "shipped" }),
    ]);
    expect(r.withDiscount.settled).toBe(4);
    expect(r.withDiscount.returnRate).toBe(25);
  });

  it("بيحسب فرق متوسط الأوردر", () => {
    const r = discountImpact([
      ...many(6, { itemsTotal: 1500, discount: 300 }),
      ...many(6, { itemsTotal: 1000 }),
    ]);
    // ١٢٠٠ مقابل ١٠٠٠ = ٢٠٪
    expect(r.averageGapPercent).toBe(20);
  });

  it("⚠️ مجموعة صغيرة = مفيش حكم", () => {
    const r = discountImpact([
      ...many(MIN_ORDERS_PER_GROUP - 1, { discount: 100 }),
      ...many(20, { discount: 0 }),
    ]);
    expect(r.comparable).toBe(false);
    expect(discountVerdict(r)).toBeNull();
  });

  it("الحكم بيتقال لما المقارنة تبقى ليها معنى", () => {
    const r = discountImpact([
      ...many(6, { itemsTotal: 1500, discount: 300 }),
      ...many(6, { itemsTotal: 1000 }),
    ]);
    expect(discountVerdict(r)).toContain("أكبر بـ20%");
  });

  it("فرق الرجوع بيتقال لو كبير", () => {
    const r = discountImpact([
      ...many(3, { discount: 100, orderStatus: "returned" }),
      ...many(3, { discount: 100, orderStatus: "delivered" }),
      ...many(6, { orderStatus: "delivered" }),
    ]);
    expect(discountVerdict(r)).toContain("بيرجع أكتر");
  });

  it("فرق الرجوع الصغير مايتقالش — ضوضاء", () => {
    const r = discountImpact([
      ...many(10, { discount: 100, orderStatus: "delivered" }),
      ...many(10, { orderStatus: "delivered" }),
    ]);
    expect(discountVerdict(r)).not.toContain("بيرجع");
  });

  it("بيجمّع الأكواد لو موجودة", () => {
    const r = discountImpact([
      order({ discount: 100, code: "eid20" }),
      order({ discount: 150, code: "EID20" }),
      order({ discount: 50, code: "SUMMER" }),
    ]);
    expect(r.codes[0]).toMatchObject({ code: "EID20", orders: 2, discount: 250 });
    expect(r.codes[1].code).toBe("SUMMER");
  });

  it("مفيش أكواد = قايمة فاضية مش صفوف وهمية", () => {
    expect(discountImpact([order({ discount: 100 })]).codes).toEqual([]);
  });

  it("مافيش أوردرات = مفيش قسمة على صفر", () => {
    const r = discountImpact([]);
    expect(r.withDiscount.average).toBe(0);
    expect(r.averageGapPercent).toBe(0);
    expect(r.comparable).toBe(false);
  });

  it("الخصم السالب بيتعامل كصفر", () => {
    const r = discountImpact([order({ discount: -100 })]);
    expect(r.without.orders).toBe(1);
    expect(r.without.revenue).toBe(1000);
  });
});
