import { describe, expect, it } from "vitest";
import { extraQueues } from "./work-queues";
import { ROW_PERMISSION } from "./daily-board";
import { QUEUE_GROUPS, QUEUE_LINKS, ROW_GROUP, groupOfRow } from "./work-queues";

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

describe("التقسيم", () => {
  it("⚠️ كل سطر في اللوحة له مجموعة مكتوبة — مش بيقع في «مستني إيدك» بالصدفة", async () => {
    const { dailyBoard } = await import("./daily-board");
    const keys = [
      ...dailyBoard([], new Date()).map((r) => r.key),
      ...rows().map((r) => r.key),
    ];
    for (const k of keys) expect(Object.keys(ROW_GROUP), k).toContain(k);
  });

  it("الشحنة الواقفة والراجعة مستنيين حد تاني", () => {
    expect(groupOfRow("stuck")).toBe("others");
    expect(groupOfRow("returning")).toBe("others");
  });

  it("الفرص = فلوس ممكن ترجع", () => {
    expect(groupOfRow("rating")).toBe("chances");
    expect(QUEUE_LINKS.filter((l) => l.group === "chances").map((l) => l.href)).toEqual([
      "/orders/rescue",
      "/orders/carts",
      "/orders/followup",
    ]);
  });

  it("كل مجموعة ليها لينكات أو سطور — مفيش مجموعة فاضية بالتعريف", () => {
    for (const g of QUEUE_GROUPS) {
      const has =
        Object.values(ROW_GROUP).includes(g.key) ||
        QUEUE_LINKS.some((l) => l.group === g.key);
      expect(has, g.key).toBe(true);
    }
  });
});
