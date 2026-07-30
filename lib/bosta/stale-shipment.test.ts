import { describe, expect, it } from "vitest";
import {
  STALE_MILESTONES,
  checkStalePickup,
  stalePickupMessage,
} from "./stale-shipment";

const NOW = new Date("2026-07-30T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const check = (over: Partial<Parameters<typeof checkStalePickup>[0]> = {}) =>
  checkStalePickup({
    createdAt: daysAgo(5),
    orderStatus: "ready",
    alertedDay: null,
    now: NOW,
    ...over,
  });

describe("مراحل التنبيه", () => {
  it("المراحل هي ٣ و٧ و١٠ و١٣", () => {
    expect([...STALE_MILESTONES]).toEqual([3, 7, 10, 13]);
  });

  it("كل مرحلة بتنبّه لما عمر الشحنة يوصلها", () => {
    expect(check({ createdAt: daysAgo(3) }).milestone).toBe(3);
    expect(check({ createdAt: daysAgo(7) }).milestone).toBe(7);
    expect(check({ createdAt: daysAgo(10) }).milestone).toBe(10);
    expect(check({ createdAt: daysAgo(13) }).milestone).toBe(13);
  });

  it("بين المراحل بتاخد المرحلة اللي قبلها", () => {
    expect(check({ createdAt: daysAgo(5) }).milestone).toBe(3);
    expect(check({ createdAt: daysAgo(9) }).milestone).toBe(7);
    expect(check({ createdAt: daysAgo(20) }).milestone).toBe(13);
  });

  it("قبل ٣ أيام مانزنّش", () => {
    for (const d of [0, 1, 2]) {
      expect(check({ createdAt: daysAgo(d) }), `${d} يوم`).toMatchObject({
        milestone: null,
        skip: "too_soon",
      });
    }
  });

  it("المرحلة اللي نبّهنا عليها مابتتكررش", () => {
    // المزامنة كل ١٥ دقيقة — من غير الشرط ده هتزنّ ٩٦ مرة في اليوم
    expect(check({ createdAt: daysAgo(5), alertedDay: 3 })).toMatchObject({
      milestone: null,
      skip: "already_alerted",
    });
  });

  it("بس المرحلة اللي بعدها بتنبّه عادي", () => {
    expect(check({ createdAt: daysAgo(8), alertedDay: 3 }).milestone).toBe(7);
    expect(check({ createdAt: daysAgo(14), alertedDay: 10 }).milestone).toBe(13);
  });

  it("خلصنا المراحل كلها = مافيش زن تاني", () => {
    expect(check({ createdAt: daysAgo(30), alertedDay: 13 })).toMatchObject({
      milestone: null,
      skip: "already_alerted",
    });
  });

  it("المندوب استلمها خلاص = مالناش دعوة", () => {
    for (const s of ["shipped", "out_for_delivery", "delivered", "returned"]) {
      expect(check({ orderStatus: s }), s).toMatchObject({
        milestone: null,
        skip: "not_waiting",
      });
    }
  });

  it("مفيش تاريخ إنشاء = مانخمّنش", () => {
    expect(check({ createdAt: null })).toMatchObject({
      milestone: null,
      skip: "no_date",
    });
  });
});

describe("رسالة الشحنة الواقفة", () => {
  const base = {
    orderNumber: "1374",
    customerName: "أمينة فتحي",
    tracking: "102657691",
  };

  it("المراحل الأولى: كلّم بوسطة", () => {
    const m = stalePickupMessage({ ...base, days: 5, milestone: 3 });
    expect(m).toContain("شحنة واقفة");
    expect(m).toContain("1374");
    expect(m).toContain("أمينة فتحي");
    expect(m).toContain("5 يوم");
    expect(m).toContain("كلّم بوسطة");
  });

  it("آخر مرحلة: نبرة مختلفة وبتقول فاضل كام يوم", () => {
    const m = stalePickupMessage({ ...base, days: 13, milestone: 13 });
    expect(m).toContain("آخر فرصة");
    expect(m).toContain("فاضل 1 يوم");
    expect(m).toContain("مفيش رجعة");
  });

  it("عدّى ميعاد الأرشفة = مابنقولش أرقام سالبة", () => {
    const m = stalePickupMessage({ ...base, days: 20, milestone: 13 });
    expect(m).not.toMatch(/فاضل -/);
    expect(m).toContain("اليوم ده");
  });

  it("بتستحمل الناقص", () => {
    const m = stalePickupMessage({
      orderNumber: null,
      customerName: null,
      tracking: null,
      days: 4,
      milestone: 3,
    });
    expect(m).not.toContain("undefined");
    expect(m).not.toContain("null");
  });
});
