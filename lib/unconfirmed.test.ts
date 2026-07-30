import { describe, expect, it } from "vitest";
import {
  GROUP_ABOVE,
  checkUnconfirmed,
  unconfirmedGroupMessage,
  unconfirmedMessage,
} from "./unconfirmed";

const NOW = new Date("2026-07-30T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const check = (over: Partial<Parameters<typeof checkUnconfirmed>[0]> = {}) =>
  checkUnconfirmed({
    orderStatus: "new",
    orderDate: daysAgo(3),
    remindedDay: null,
    now: NOW,
    ...over,
  });

describe("الأوردر اللي لسه جديد", () => {
  it("بينبّه كل يوم — مش مراحل", () => {
    // عمر طلبها كده بالنص: يوميًا لحد ما يأكّد
    expect(check({ orderDate: daysAgo(1) }).day).toBe(1);
    expect(check({ orderDate: daysAgo(2) }).day).toBe(2);
    expect(check({ orderDate: daysAgo(5) }).day).toBe(5);
    expect(check({ orderDate: daysAgo(40) }).day).toBe(40);
  });

  it("أول يوم مافيش تنبيه — لسه بدري", () => {
    expect(check({ orderDate: daysAgo(0) })).toMatchObject({
      day: null,
      skip: "too_soon",
    });
  });

  it("مرة واحدة في اليوم مش كل ١٥ دقيقة", () => {
    expect(check({ orderDate: daysAgo(3), remindedDay: 3 })).toMatchObject({
      day: null,
      skip: "already_alerted",
    });
    // بكرة بينبّه تاني
    expect(check({ orderDate: daysAgo(4), remindedDay: 3 }).day).toBe(4);
  });

  it("أول ما يتأكّد التنبيه يوقف", () => {
    for (const s of ["confirmed", "packed", "ready", "cancelled", "delivered"]) {
      expect(check({ orderStatus: s }), s).toMatchObject({
        day: null,
        skip: "not_new",
      });
    }
  });

  it("مفيش تاريخ = مانخمّنش", () => {
    expect(check({ orderDate: null })).toMatchObject({
      day: null,
      skip: "no_date",
    });
  });
});

describe("رسالة الأوردر المش مؤكد", () => {
  it("بتقول العميل وتليفونه والمبلغ", () => {
    const m = unconfirmedMessage({
      orderNumber: "1375",
      customerName: "أحمد خالد",
      customerPhone: "01001234567",
      total: 1388,
      days: 3,
    });
    expect(m).toContain("لسه مش مؤكد");
    expect(m).toContain("1375");
    expect(m).toContain("أحمد خالد");
    expect(m).toContain("01001234567");
    expect(m).toContain("1388");
    expect(m).toContain("من 3 يوم");
  });

  it("أول يوم بتقول امبارح", () => {
    const m = unconfirmedMessage({
      orderNumber: "1",
      customerName: null,
      customerPhone: null,
      total: 0,
      days: 1,
    });
    expect(m).toContain("امبارح");
    expect(m).not.toContain("undefined");
  });
});

describe("التجميع لما العدد يزيد", () => {
  it("الحد هو ٥", () => {
    expect(GROUP_ABOVE).toBe(5);
  });

  it("الرسالة المجمّعة بتقول العدد وأقدم واحد", () => {
    const m = unconfirmedGroupMessage({ count: 9, oldestDays: 6 });
    expect(m).toContain("9 أوردر");
    expect(m).toContain("من 6 يوم");
    expect(m).toContain("افتحهم");
  });

  it("أقدم واحد يوم = امبارح", () => {
    expect(unconfirmedGroupMessage({ count: 7, oldestDays: 1 })).toContain("امبارح");
  });
});
