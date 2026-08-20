import { describe, it, expect } from "vitest";
import {
  checkDrop,
  dropMessage,
  MIN_WEEKS,
  MIN_AVERAGE,
  type DropOrder,
} from "./drop-alert";

// ٢٠ أغسطس ٢٠٢٦ — خميس
const NOW = new Date("2026-08-20T18:00:00Z");
const dayBack = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** أوردرات في يوم معيّن */
function on(day: string, count: number, status = "delivered"): DropOrder[] {
  return Array.from({ length: count }, () => ({
    orderStatus: status,
    orderDate: `${day}T12:00:00Z`,
  }));
}

/** نفس اليوم من ٤ أسابيع فاتت */
const pastWeeks = (each: number) =>
  [7, 14, 21, 28].flatMap((d) => on(dayBack(d), each));

describe("حسّاس العطل", () => {
  it("النزول الكبير بينبّه", () => {
    const c = checkDrop([...pastWeeks(10), ...on(dayBack(0), 2)], NOW);
    expect(c.alert).toBe(true);
    expect(c.today).toBe(2);
    expect(c.usual).toBe(10);
    expect(c.dropPercent).toBe(80);
  });

  it("اليوم العادي مابينبّهش", () => {
    const c = checkDrop([...pastWeeks(10), ...on(dayBack(0), 9)], NOW);
    expect(c.alert).toBe(false);
  });

  it("⚠️ المقارنة بنفس اليوم من الأسبوع مش بالمتوسط العام", () => {
    // أيام تانية مليانة، ونفس اليوم ضعيف دايمًا
    const others = [1, 2, 3].flatMap((d) => on(dayBack(d), 50));
    const c = checkDrop([...others, ...pastWeeks(3), ...on(dayBack(0), 3)], NOW);
    expect(c.usual).toBe(3);
    expect(c.alert).toBe(false);
  });

  it("⚠️ أسابيع قليلة = مفيش تنبيه", () => {
    const short = [7, 14].flatMap((d) => on(dayBack(d), 10));
    const c = checkDrop([...short, ...on(dayBack(0), 0)], NOW, MIN_WEEKS - 1);
    expect(c.alert).toBe(false);
    expect(c.dropPercent).toBeNull();
  });

  it("⚠️ اليوم اللي متوسطه صغير مايتقارنش", () => {
    const c = checkDrop([...pastWeeks(MIN_AVERAGE - 1), ...on(dayBack(0), 0)], NOW);
    expect(c.alert).toBe(false);
    expect(c.dropPercent).toBeNull();
  });

  it("الملغي مش بيعة", () => {
    const c = checkDrop(
      [...pastWeeks(10), ...on(dayBack(0), 8, "cancelled")],
      NOW
    );
    expect(c.today).toBe(0);
    expect(c.alert).toBe(true);
  });

  it("مافيش أوردرات خالص = مفيش تنبيه ومفيش قسمة على صفر", () => {
    const c = checkDrop([], NOW);
    expect(c.alert).toBe(false);
    expect(c.usual).toBe(0);
    expect(c.dropPercent).toBeNull();
  });

  it("التواريخ الغلط بتتشال", () => {
    const bad: DropOrder[] = [
      { orderStatus: "delivered", orderDate: "مش تاريخ" },
      { orderStatus: "delivered", orderDate: null },
    ];
    expect(() => checkDrop(bad, NOW)).not.toThrow();
  });

  it("⚠️ الرسالة بتقول الرقم والسبب المحتمل من غير ما تقول اعمل إيه", () => {
    const c = checkDrop([...pastWeeks(10), ...on(dayBack(0), 1)], NOW);
    const text = dropMessage(c, "الخميس");
    expect(text).toContain("1 أوردر");
    expect(text).toContain("الخميس");
    expect(text).not.toContain("لازم");
    expect(text).not.toContain("اعمل");
  });
});
