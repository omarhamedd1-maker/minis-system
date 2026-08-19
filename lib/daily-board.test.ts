import { describe, it, expect } from "vitest";
import { dailyBoard, boardIsClear, STUCK_DAYS, type BoardOrder } from "./daily-board";

const NOW = new Date("2026-08-19T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const row = (rows: ReturnType<typeof dailyBoard>, key: string) =>
  rows.find((r) => r.key === key)!;

describe("لوحة اليوم", () => {
  it("بتعدّ الجديد المحتاج تأكيد", () => {
    const rows = dailyBoard(
      [
        { id: "a", orderStatus: "new" },
        { id: "b", orderStatus: "new" },
        { id: "c", orderStatus: "confirmed" },
      ],
      NOW
    );
    expect(row(rows, "confirm").count).toBe(2);
  });

  it("المؤكد اللي معاه رقم تتبع مايتعدّش في المستني بوليصة", () => {
    const orders: BoardOrder[] = [
      { id: "a", orderStatus: "confirmed" },
      { id: "b", orderStatus: "confirmed", bostaTracking: "123" },
      { id: "c", orderStatus: "packed", bostaTracking: "   " },
    ];
    expect(row(dailyBoard(orders, NOW), "ship").count).toBe(2);
  });

  it("الشحنة بتبقى واقفة بعد المدة بس", () => {
    const orders: BoardOrder[] = [
      { id: "a", orderStatus: "shipped", bostaCreatedAt: daysAgo(STUCK_DAYS) },
      { id: "b", orderStatus: "shipped", bostaCreatedAt: daysAgo(STUCK_DAYS - 1) },
      { id: "c", orderStatus: "out_for_delivery", bostaCreatedAt: daysAgo(20) },
    ];
    expect(row(dailyBoard(orders, NOW), "stuck").count).toBe(2);
  });

  it("الشحنة من غير تاريخ مابتتحسبش واقفة", () => {
    const rows = dailyBoard([{ id: "a", orderStatus: "shipped" }], NOW);
    expect(row(rows, "stuck").count).toBe(0);
  });

  it("التاريخ الغلط مابيوقعش الحساب", () => {
    const rows = dailyBoard(
      [{ id: "a", orderStatus: "shipped", bostaCreatedAt: "مش تاريخ" }],
      NOW
    );
    expect(row(rows, "stuck").count).toBe(0);
  });

  it("فلوس بوسطة = المسلّم اللي لسه ماتحصّلش", () => {
    const orders: BoardOrder[] = [
      { id: "a", orderStatus: "delivered", bostaCod: 500 },
      { id: "b", orderStatus: "delivered", bostaCod: 300, bostaCollected: true },
      { id: "c", orderStatus: "delivered", bostaCod: 0 },
      { id: "d", orderStatus: "returned", bostaCod: 900 },
    ];
    const r = row(dailyBoard(orders, NOW), "money");
    expect(r.count).toBe(1);
    expect(r.money).toBe(500);
  });

  it("اللينك بيفتح نفس الأوردرات بالظبط", () => {
    const rows = dailyBoard(
      [
        { id: "a1", orderStatus: "new" },
        { id: "a2", orderStatus: "new" },
      ],
      NOW
    );
    expect(row(rows, "confirm").href).toBe("/orders?only=a1,a2");
  });

  it("العدد الكبير بيرجّع فلتر عادي عشان اللينك مايتقطعش", () => {
    const many: BoardOrder[] = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`,
      orderStatus: "new",
    }));
    expect(row(dailyBoard(many, NOW), "confirm").href).toBe("/orders?status=new");
  });

  it("مافيش أوردرات = اللوحة فاضية ومفيش عاجل", () => {
    const rows = dailyBoard([], NOW);
    expect(rows.every((r) => r.count === 0)).toBe(true);
    expect(boardIsClear(rows)).toBe(true);
  });

  it("الراجعة والفلوس مش عاجل — دول خبر مش شغل", () => {
    const rows = dailyBoard(
      [
        { id: "a", orderStatus: "returning" },
        { id: "b", orderStatus: "delivered", bostaCod: 100 },
      ],
      NOW
    );
    expect(boardIsClear(rows)).toBe(true);
  });
});
