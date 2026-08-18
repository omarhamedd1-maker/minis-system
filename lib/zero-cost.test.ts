import { describe, expect, it } from "vitest";
import { zeroCostMessage, zeroCostNote, type CostOrder } from "./zero-cost";

const order = (...costs: number[]): CostOrder => ({
  order_items: costs.map((c) => ({ cost_price_at_order: c })),
});

describe("تكلفة صفر", () => {
  it("كل التكاليف مسجّلة → مافيش حاجة تتقال", () => {
    const n = zeroCostNote([order(10), order(20, 30)]);
    expect(n.allZero).toBe(0);
    expect(n.misleading).toBe(false);
    expect(zeroCostMessage(n)).toBeNull();
  });

  it("**كله بصفر → الرقم ده مبيعات مش ربح**", () => {
    const n = zeroCostNote([order(0), order(0, 0)]);
    expect(n.share).toBe(100);
    expect(n.misleading).toBe(true);
    expect(zeroCostMessage(n)).toContain("المبيعات نفسها");
  });

  it("الأوردر اللي بعض بنوده بصفر بيتعدّ لوحده", () => {
    const n = zeroCostNote([order(0, 5)]);
    expect(n.someZero).toBe(1);
    expect(n.allZero).toBe(0);
  });

  it("**تحت العتبة مابيتقالش** — الرقم لسه بيعبّر عن الاتجاه", () => {
    // ٣ من ٢٤٣ = ١٪، ودي حالة مينيز الحقيقية
    const rows = [...Array(240)].map(() => order(10)).concat([order(0), order(0), order(0)]);
    const n = zeroCostNote(rows);
    expect(n.share).toBe(1);
    expect(zeroCostMessage(n)).toBeNull();
  });

  it("فوق العتبة بيتقال بالنسبة", () => {
    const rows = [...Array(6)].map(() => order(10)).concat([order(0), order(0), order(0), order(0)]);
    const n = zeroCostNote(rows);
    expect(n.share).toBe(40);
    expect(zeroCostMessage(n)).toContain("40%");
  });

  it("**الأوردر من غير بنود بره الحسبة** — مش تكلفة ناقصة", () => {
    const n = zeroCostNote([{ order_items: [] }, { order_items: null }, order(0)]);
    expect(n.counted).toBe(1);
    expect(n.share).toBe(100);
  });

  it("مفيش أوردرات خالص؟ مافيش حاجة تتقال", () => {
    const n = zeroCostNote([]);
    expect(n.misleading).toBe(false);
    expect(zeroCostMessage(n)).toBeNull();
  });
});
