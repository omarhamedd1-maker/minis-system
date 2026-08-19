import { describe, it, expect } from "vitest";
import {
  rescueQueue,
  rescueValue,
  RESCUE_WINDOW_DAYS,
  type RescueOrder,
} from "./rescue";

const NOW = new Date("2026-08-19T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const order = (o: Partial<RescueOrder>): RescueOrder => ({
  id: "a",
  orderNumber: "1367",
  orderStatus: "out_for_delivery",
  exception: "العميل رفض يستلم",
  lastMoveAt: daysAgo(1),
  customerName: "مروة",
  customerPhone: "01001234567",
  cod: 1270,
  ...o,
});

describe("طابور الإنقاذ", () => {
  it("المحاولة الفاشلة بتدخل الطابور", () => {
    const q = rescueQueue([order({})], NOW);
    expect(q).toHaveLength(1);
    expect(q[0].reason).toBe("العميل رفض يستلم");
  });

  it("بوسطة الواقفة بتدخل حتى من غير نص سبب", () => {
    const q = rescueQueue(
      [order({ orderStatus: "awaiting_action", exception: null })],
      NOW
    );
    expect(q).toHaveLength(1);
    expect(q[0].waiting).toBe(true);
    expect(q[0].reason).toContain("مستنية قرار");
  });

  it("الشحنة الماشية عادي مش في الطابور", () => {
    expect(rescueQueue([order({ exception: null })], NOW)).toEqual([]);
  });

  it("⚠️ اللي رجع أو اتسلّم خلاص فات وقته", () => {
    for (const s of ["returned", "returning", "delivered", "cancelled", "new"]) {
      expect(rescueQueue([order({ orderStatus: s })], NOW)).toEqual([]);
    }
  });

  it("⚠️ المحاولة القديمة بتخرج — القرار اتاخد خلاص", () => {
    expect(
      rescueQueue([order({ lastMoveAt: daysAgo(RESCUE_WINDOW_DAYS + 1) })], NOW)
    ).toEqual([]);
    expect(
      rescueQueue([order({ lastMoveAt: daysAgo(RESCUE_WINDOW_DAYS) })], NOW)
    ).toHaveLength(1);
  });

  it("⚠️ الأحدث الأول — العكس المقصود", () => {
    const q = rescueQueue(
      [
        order({ id: "قديم", lastMoveAt: daysAgo(5) }),
        order({ id: "جديد", lastMoveAt: daysAgo(1) }),
      ],
      NOW
    );
    expect(q.map((r) => r.id)).toEqual(["جديد", "قديم"]);
  });

  it("اللي بوسطة مستنياه فوق الكل", () => {
    const q = rescueQueue(
      [
        order({ id: "محاولة", lastMoveAt: daysAgo(0) }),
        order({ id: "واقفة", orderStatus: "awaiting_action", lastMoveAt: daysAgo(5) }),
      ],
      NOW
    );
    expect(q[0].id).toBe("واقفة");
  });

  it("من غير تليفون مافيش مكالمة", () => {
    expect(rescueQueue([order({ customerPhone: null })], NOW)).toEqual([]);
  });

  it("التاريخ الناقص مايمنعش السطر", () => {
    const q = rescueQueue([order({ lastMoveAt: null })], NOW);
    expect(q).toHaveLength(1);
    expect(q[0].days).toBe(0);
  });

  it("بيجمع الفلوس اللي في الطابور", () => {
    const q = rescueQueue(
      [order({ id: "a", cod: 1000 }), order({ id: "b", cod: 500 })],
      NOW
    );
    expect(rescueValue(q)).toBe(1500);
  });

  it("مافيش أوردرات = طابور فاضي بصفر", () => {
    expect(rescueQueue([], NOW)).toEqual([]);
    expect(rescueValue([])).toBe(0);
  });
});
