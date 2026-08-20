import { describe, it, expect } from "vitest";
import {
  deadStock,
  frozenValue,
  withoutCost,
  DEAD_AFTER_DAYS,
  type DeadVariant,
  type DeadSale,
} from "./dead-stock";

const NOW = new Date("2026-08-20T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const v = (o: Partial<DeadVariant> = {}): DeadVariant => ({
  id: "v1",
  name: "مقبض",
  onHand: 10,
  costPrice: 200,
  ...o,
});

const sale = (o: Partial<DeadSale> = {}): DeadSale => ({
  variantId: "v1",
  at: daysAgo(5),
  orderStatus: "delivered",
  ...o,
});

describe("البضاعة الميتة", () => {
  it("اللي مااتباعش من فترة بيبان", () => {
    const rows = deadStock([v()], [sale({ at: daysAgo(90) })], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].days).toBe(90);
  });

  it("اللي اتباع من قريّب مابيبانش", () => {
    expect(deadStock([v()], [sale({ at: daysAgo(5) })], NOW)).toEqual([]);
  });

  it("على الحد بالظبط بيبان", () => {
    const rows = deadStock([v()], [sale({ at: daysAgo(DEAD_AFTER_DAYS) })], NOW);
    expect(rows).toHaveLength(1);
  });

  it("اللي عمره ما اتباع بيبان من غير تاريخ", () => {
    const rows = deadStock([v()], [], NOW);
    expect(rows[0].lastSold).toBeNull();
    expect(rows[0].days).toBeNull();
  });

  it("⚠️ اللي مافيش منه حاجة مش بضاعة ميتة — مفيش فلوس واقفة أصلًا", () => {
    expect(deadStock([v({ onHand: 0 }), v({ id: "v2", onHand: -3 })], [], NOW)).toEqual(
      []
    );
  });

  it("⚠️ القيمة بالتكلفة مش بسعر البيع", () => {
    const rows = deadStock([v({ onHand: 10, costPrice: 200 })], [], NOW);
    expect(rows[0].value).toBe(2000);
  });

  it("⚠️ اللي تكلفته صفر بيبان بعدد القطع من غير قيمة", () => {
    const rows = deadStock([v({ costPrice: 0 })], [], NOW);
    expect(rows[0].value).toBeNull();
    expect(rows[0].onHand).toBe(10);
  });

  it("الأغلى الأول، واللي مالوش تكلفة بعدهم", () => {
    const rows = deadStock(
      [
        v({ id: "رخيص", costPrice: 10, onHand: 2 }),
        v({ id: "غالي", costPrice: 500, onHand: 4 }),
        v({ id: "مجهول", costPrice: 0, onHand: 50 }),
      ],
      [],
      NOW
    );
    expect(rows.map((r) => r.id)).toEqual(["غالي", "رخيص", "مجهول"]);
  });

  it("الملغي والراجع مش بيعة", () => {
    const rows = deadStock(
      [v()],
      [sale({ at: daysAgo(1), orderStatus: "cancelled" })],
      NOW
    );
    expect(rows).toHaveLength(1);
  });

  it("التواريخ الغلط مابتوقعش الحساب", () => {
    const rows = deadStock(
      [v()],
      [sale({ at: "مش تاريخ" }), sale({ at: null })],
      NOW
    );
    expect(rows).toHaveLength(1);
  });

  it("الإجمالي بيجمع اللي ليه تكلفة بس، والباقي بيتعدّ", () => {
    const rows = deadStock(
      [v({ id: "a", costPrice: 100, onHand: 3 }), v({ id: "b", costPrice: 0 })],
      [],
      NOW
    );
    expect(frozenValue(rows)).toBe(300);
    expect(withoutCost(rows)).toBe(1);
  });

  it("مافيش بيانات = مافيش صفوف", () => {
    expect(deadStock([], [], NOW)).toEqual([]);
    expect(frozenValue([])).toBe(0);
  });
});
