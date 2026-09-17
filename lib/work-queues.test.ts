import { describe, expect, it } from "vitest";
import { extraQueues } from "./work-queues";
import { ROW_PERMISSION } from "./daily-board";

const rows = (over: Partial<Parameters<typeof extraQueues>[0]> = {}) =>
  extraQueues({ deletionOrderIds: [], badRatings: 0, zeroCostOrderIds: [], ...over });

const row = (key: string, over = {}) => rows(over).find((r) => r.key === key)!;

describe("طوابير /work التانية", () => {
  it("طلب الحذف عاجل — بيوقف شغل حد تاني", () => {
    expect(row("deletion", { deletionOrderIds: ["a", "b"] })).toMatchObject({
      count: 2,
      urgent: true,
      href: "/orders?only=a,b",
    });
  });

  it("التقييم السيء وتكلفة الصفر خبر مش شغل واقف", () => {
    expect(row("rating", { badRatings: 3 }).urgent).toBe(false);
    expect(row("zero_cost", { zeroCostOrderIds: ["a"] }).urgent).toBe(false);
  });

  it("⚠️ اللينك بيفتح نفس الأوردرات — والكتير بيرجّع لينك عام", () => {
    expect(row("zero_cost", { zeroCostOrderIds: ["x"] }).href).toBe("/orders?only=x");
    const many = Array.from({ length: 61 }, (_, i) => `id${i}`);
    expect(row("zero_cost", { zeroCostOrderIds: many }).href).toBe("/products?missing_cost=1");
    expect(row("deletion", { deletionOrderIds: many }).href).toBe("/orders");
  });

  it("فاضي = أصفار ومفيش عاجل", () => {
    expect(rows().every((r) => r.count === 0 && !r.urgent)).toBe(true);
  });

  it("التقييمات بتتفتح على صفحتها مش على الأوردرات", () => {
    expect(row("rating", { badRatings: 2 }).href).toBe("/orders/ratings");
  });

  it("⚠️ سطر التكلفة بصلاحية التكلفة — مش لأي حد", () => {
    expect(ROW_PERMISSION.zero_cost).toBe("products.cost");
  });
});
