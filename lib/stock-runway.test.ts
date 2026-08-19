import { describe, it, expect } from "vitest";
import {
  stockRunway,
  runningOut,
  untrackedSellers,
  WINDOW_DAYS,
  MIN_UNITS_IN_WINDOW,
  type RunwaySale,
} from "./stock-runway";

const NOW = new Date("2026-08-19T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

/** بيعات موزّعة على أيام متتالية */
function sales(opts: {
  variantId: string;
  count: number;
  qty?: number;
  status?: string;
  startDaysAgo?: number;
}): RunwaySale[] {
  const out: RunwaySale[] = [];
  for (let i = 0; i < opts.count; i++) {
    out.push({
      variantId: opts.variantId,
      at: daysAgo((opts.startDaysAgo ?? 1) + i),
      orderStatus: opts.status ?? "delivered",
      quantity: opts.qty ?? 1,
    });
  }
  return out;
}

describe("المخزون هيقعد كام يوم", () => {
  it("بيقسّم الموجود على معدّل البيع اليومي", () => {
    // ٣٠ قطعة في ٣٠ يوم = واحدة في اليوم، وفاضل ٩ = ٩ أيام
    const rows = stockRunway(
      [{ id: "v1", name: "مقبض", onHand: 9 }],
      sales({ variantId: "v1", count: 30 }),
      NOW
    );
    expect(rows[0].perDay).toBeCloseTo(1, 5);
    expect(rows[0].daysLeft).toBe(9);
    expect(rows[0].tracked).toBe(true);
    expect(rows[0].soldInWindow).toBe(30);
  });

  it("الأقرب للنفاد الأول", () => {
    const rows = stockRunway(
      [
        { id: "v1", name: "بطيء", onHand: 100 },
        { id: "v2", name: "سريع", onHand: 6 },
      ],
      [
        ...sales({ variantId: "v1", count: 5 }),
        ...sales({ variantId: "v2", count: 30 }),
      ],
      NOW
    );
    expect(rows.map((r) => r.name)).toEqual(["سريع", "بطيء"]);
  });

  it("⚠️ البيع القديم بره النافذة مايرفعش المعدّل", () => {
    const rows = stockRunway(
      [{ id: "v1", name: "مقبض", onHand: 50 }],
      [
        ...sales({ variantId: "v1", count: 100, startDaysAgo: WINDOW_DAYS + 1 }),
        ...sales({ variantId: "v1", count: 3 }),
      ],
      NOW
    );
    expect(rows[0].soldInWindow).toBe(3);
  });

  it("اللي مااتباعش كفاية مالوش تقدير خالص", () => {
    const rows = stockRunway(
      [{ id: "v1", name: "مقبض", onHand: 2 }],
      sales({ variantId: "v1", count: MIN_UNITS_IN_WINDOW - 1 }),
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("الملغي والراجع مش استهلاك", () => {
    const rows = stockRunway(
      [{ id: "v1", name: "مقبض", onHand: 10 }],
      [
        ...sales({ variantId: "v1", count: 10, status: "cancelled" }),
        ...sales({ variantId: "v1", count: 10, status: "returned" }),
      ],
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("المؤكد اللي لسه ماخرجش بيتحسب — البضاعة اتحجزت", () => {
    const rows = stockRunway(
      [{ id: "v1", name: "مقبض", onHand: 10 }],
      sales({ variantId: "v1", count: 6, status: "confirmed" }),
      NOW
    );
    expect(rows[0].soldInWindow).toBe(6);
  });

  it("الكمية بتتجمع مش عدد الأوردرات", () => {
    const rows = stockRunway(
      [{ id: "v1", name: "مقبض", onHand: 30 }],
      sales({ variantId: "v1", count: 5, qty: 4 }),
      NOW
    );
    expect(rows[0].soldInWindow).toBe(20);
  });

  it("⚠️ بيتباع ومخزونه صفر أو سالب = الرقم مش متمسك، مش خلص", () => {
    const rows = stockRunway(
      [
        { id: "v1", name: "صفر", onHand: 0 },
        { id: "v2", name: "سالب", onHand: -5 },
      ],
      [...sales({ variantId: "v1", count: 10 }), ...sales({ variantId: "v2", count: 10 })],
      NOW
    );
    expect(rows.every((r) => r.tracked === false)).toBe(true);
    expect(rows.every((r) => r.daysLeft === null)).toBe(true);
    // ومايدخلش تنبيه «قرّب يخلص» خالص
    expect(runningOut(rows)).toEqual([]);
    expect(untrackedSellers(rows).map((r) => r.name)).toEqual(["صفر", "سالب"]);
  });

  it("البند من غير شكل أو بكمية صفر بيتشال", () => {
    const rows = stockRunway(
      [{ id: "v1", name: "مقبض", onHand: 10 }],
      [
        { variantId: null, at: daysAgo(1), orderStatus: "delivered", quantity: 50 },
        { variantId: "v1", at: daysAgo(1), orderStatus: "delivered", quantity: 0 },
      ],
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("التاريخ الغلط مابيوقعش الحساب", () => {
    const rows = stockRunway(
      [{ id: "v1", name: "مقبض", onHand: 10 }],
      [
        { variantId: "v1", at: "مش تاريخ", orderStatus: "delivered", quantity: 5 },
        { variantId: "v1", at: null, orderStatus: "delivered", quantity: 5 },
      ],
      NOW
    );
    expect(rows).toEqual([]);
  });

  it("قايمة «قرّب يخلص» بتاخد اللي تحت الحد بس", () => {
    const rows = stockRunway(
      [
        { id: "v1", name: "قريب", onHand: 5 },
        { id: "v2", name: "مرتاح", onHand: 300 },
      ],
      [...sales({ variantId: "v1", count: 30 }), ...sales({ variantId: "v2", count: 30 })],
      NOW
    );
    expect(runningOut(rows).map((r) => r.name)).toEqual(["قريب"]);
  });

  it("مافيش بيانات = مافيش صفوف من غير قسمة على صفر", () => {
    expect(stockRunway([], [], NOW)).toEqual([]);
    expect(runningOut([])).toEqual([]);
  });
});

describe("الرقم اللي مش متمسك", () => {
  it("مابيزاحمش اللي عنده رقم حقيقي في الترتيب", () => {
    const rows = stockRunway(
      [
        { id: "v1", name: "مش متمسك", onHand: 0 },
        { id: "v2", name: "قريب", onHand: 3 },
      ],
      [...sales({ variantId: "v1", count: 30 }), ...sales({ variantId: "v2", count: 30 })],
      NOW
    );
    expect(rows[0].name).toBe("قريب");
  });
});
