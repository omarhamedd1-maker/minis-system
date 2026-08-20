import { describe, it, expect } from "vitest";
import {
  checkDrop,
  dropMessage,
  MIN_WEEKS,
  MIN_AVERAGE,
  MIN_HOUR,
  type DropOrder,
} from "./drop-alert";

// ٢٠ أغسطس ٢٠٢٦ — خميس، الساعة ٦ مساءً بتوقيت مصر (١٥:٠٠ عالمي في الصيف)
const NOW = new Date("2026-08-20T15:00:00Z");
/** الساعة ٣ الفجر بتوقيت مصر — الوقت اللي التنبيه الغلط رن فيه */
const DAWN = new Date("2026-08-20T00:47:00Z");

const dayBack = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** أوردرات في يوم معيّن، الساعة ١٠ صباحًا بتوقيت مصر */
function on(day: string, count: number, status = "delivered"): DropOrder[] {
  return Array.from({ length: count }, () => ({
    orderStatus: status,
    orderDate: `${day}T07:00:00Z`,
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

  it("⚠️⚠️ اليوم اللي لسه بادئ مش يوم واقع — مافيش تنبيه بالليل ولا الفجر", () => {
    // نفس الداتا بالظبط اللي بتنبّه الساعة ٦ مساءً
    const orders = [...pastWeeks(10), ...on(dayBack(0), 0)];
    const c = checkDrop(orders, DAWN);
    expect(c.tooEarly).toBe(true);
    expect(c.alert).toBe(false);
    expect(c.dropPercent).toBeNull();
  });

  it("⚠️ المقارنة لنفس الساعة — اللي بيتباع بالليل مايتحسبش على النهاردة", () => {
    // الأسابيع اللي فاتت: ٥ بدري و٥ بالليل. النهاردة ٤ بدري.
    // لو حسبنا اليوم كله فات، «المعتاد» يبقى ١٠ والنهاردة ٤ = تنبيه غلط.
    const past = [7, 14, 21, 28].flatMap((d) => [
      ...on(dayBack(d), 5),
      ...Array.from({ length: 5 }, () => ({
        orderStatus: "delivered",
        orderDate: `${dayBack(d)}T20:00:00Z`,
      })),
    ]);
    const c = checkDrop([...past, ...on(dayBack(0), 4)], NOW);
    expect(c.usual).toBe(5);
    expect(c.alert).toBe(false);
  });

  it("⚠️ المقارنة بنفس اليوم من الأسبوع مش بالمتوسط العام", () => {
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

  it("الساعة الفاصلة معقولة — بعد نُص يوم الشغل", () => {
    expect(MIN_HOUR).toBeGreaterThanOrEqual(12);
  });
});
