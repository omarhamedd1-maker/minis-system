import { describe, it, expect } from "vitest";
import { staleBeforeShipping, STALE_AFTER_DAYS, type StaleOrder } from "./stale-orders";

const NOW = new Date("2026-08-19T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("أوردر قاعد من غير حركة", () => {
  it("المؤكد اللي عدّت عليه المدة بيتحسب", () => {
    const rows = staleBeforeShipping(
      [
        { id: "a", orderNumber: "1", orderStatus: "confirmed", orderDate: daysAgo(27) },
        { id: "b", orderNumber: "2", orderStatus: "packed", orderDate: daysAgo(STALE_AFTER_DAYS) },
      ],
      NOW
    );
    expect(rows.map((r) => r.orderNumber)).toEqual(["1", "2"]);
    expect(rows[0].days).toBe(27);
  });

  it("الأقدم الأول", () => {
    const rows = staleBeforeShipping(
      [
        { id: "a", orderNumber: "1", orderStatus: "confirmed", orderDate: daysAgo(5) },
        { id: "b", orderNumber: "2", orderStatus: "confirmed", orderDate: daysAgo(20) },
      ],
      NOW
    );
    expect(rows.map((r) => r.orderNumber)).toEqual(["2", "1"]);
  });

  it("اللي لسه في المدة مايتحسبش", () => {
    const rows = staleBeforeShipping(
      [{ id: "a", orderNumber: "1", orderStatus: "confirmed", orderDate: daysAgo(STALE_AFTER_DAYS - 1) }],
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("⚠️ اللي معاه رقم تتبع بره الحسبة — بقى مسؤولية بوسطة", () => {
    const orders: StaleOrder[] = [
      {
        id: "a",
        orderNumber: "1",
        orderStatus: "confirmed",
        orderDate: daysAgo(30),
        bostaTracking: "123456",
      },
    ];
    expect(staleBeforeShipping(orders, NOW)).toEqual([]);
  });

  it("رقم التتبع الفاضي أو المسافات مش رقم تتبع", () => {
    const rows = staleBeforeShipping(
      [{ id: "a", orderNumber: "1", orderStatus: "confirmed", orderDate: daysAgo(10), bostaTracking: "   " }],
      NOW
    );
    expect(rows).toHaveLength(1);
  });

  it("الجديد والملغي والمشحون مالهمش دعوة", () => {
    const rows = staleBeforeShipping(
      [
        { id: "a", orderNumber: "1", orderStatus: "new", orderDate: daysAgo(30) },
        { id: "b", orderNumber: "2", orderStatus: "cancelled", orderDate: daysAgo(30) },
        { id: "c", orderNumber: "3", orderStatus: "delivered", orderDate: daysAgo(30) },
      ],
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("التاريخ الناقص أو الغلط بيتشال من غير ما يوقع الحساب", () => {
    const rows = staleBeforeShipping(
      [
        { id: "a", orderNumber: "1", orderStatus: "confirmed", orderDate: null },
        { id: "b", orderNumber: "2", orderStatus: "confirmed", orderDate: "مش تاريخ" },
      ],
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("التاريخ في المستقبل مش قاعد", () => {
    const rows = staleBeforeShipping(
      [{ id: "a", orderNumber: "1", orderStatus: "confirmed", orderDate: daysAgo(-5) }],
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("المدة تتظبط من برّه", () => {
    const orders: StaleOrder[] = [
      { id: "a", orderNumber: "1", orderStatus: "confirmed", orderDate: daysAgo(6) },
    ];
    expect(staleBeforeShipping(orders, NOW, 10)).toEqual([]);
    expect(staleBeforeShipping(orders, NOW, 6)).toHaveLength(1);
  });
});
