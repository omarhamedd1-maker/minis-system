import { describe, expect, it } from "vitest";
import {
  REFUND_MILESTONES,
  checkRefundDue,
  refundDue,
  refundReminderMessage,
} from "./refund";

const NOW = new Date("2026-07-30T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("حسبة المبلغ", () => {
  it("الكمية الراجعة × سعر بيعها", () => {
    expect(
      refundDue([
        { returnedQuantity: 2, salePriceAtOrder: 649 },
        { returnedQuantity: 1, salePriceAtOrder: 350 },
      ])
    ).toBe(1648);
  });

  it("البنود اللي مارجعتش مابتتحسبش", () => {
    expect(
      refundDue([
        { returnedQuantity: 1, salePriceAtOrder: 500 },
        { returnedQuantity: 0, salePriceAtOrder: 900 },
        { returnedQuantity: null, salePriceAtOrder: 700 },
      ])
    ).toBe(500);
  });

  it("مفيش حاجة رجعت = صفر", () => {
    expect(refundDue([])).toBe(0);
    expect(refundDue([{ returnedQuantity: 0, salePriceAtOrder: 500 }])).toBe(0);
  });

  it("بتجبر الكسور لقرشين", () => {
    expect(refundDue([{ returnedQuantity: 3, salePriceAtOrder: 33.333 }])).toBe(100);
  });
});

const check = (over: Partial<Parameters<typeof checkRefundDue>[0]> = {}) =>
  checkRefundDue({
    orderStatus: "returned_after_delivery",
    returnedAt: daysAgo(4),
    refundedAt: null,
    amountDue: 1298,
    remindedDay: null,
    now: NOW,
    ...over,
  });

describe("تنبيه الحوالة", () => {
  it("المراحل هي يوم و٣ و٧ و١٠", () => {
    expect([...REFUND_MILESTONES]).toEqual([1, 3, 7, 10]);
  });

  it("كل مرحلة بتنبّه لما ييجي ميعادها", () => {
    expect(check({ returnedAt: daysAgo(1) }).milestone).toBe(1);
    expect(check({ returnedAt: daysAgo(3) }).milestone).toBe(3);
    expect(check({ returnedAt: daysAgo(7) }).milestone).toBe(7);
    expect(check({ returnedAt: daysAgo(10) }).milestone).toBe(10);
  });

  it("بين المراحل بتاخد اللي قبلها", () => {
    expect(check({ returnedAt: daysAgo(5) }).milestone).toBe(3);
    expect(check({ returnedAt: daysAgo(30) }).milestone).toBe(10);
  });

  it("نفس اليوم = بدري", () => {
    expect(check({ returnedAt: daysAgo(0) })).toMatchObject({
      milestone: null,
      skip: "too_soon",
    });
  });

  it("أكّدت إنك حوّلت = التنبيه يوقف فورًا", () => {
    expect(check({ refundedAt: daysAgo(1) })).toMatchObject({
      milestone: null,
      skip: "already_refunded",
    });
  });

  it("المرحلة اللي نبّهنا عليها مابتتكررش", () => {
    expect(check({ returnedAt: daysAgo(5), remindedDay: 3 })).toMatchObject({
      milestone: null,
      skip: "already_alerted",
    });
    expect(check({ returnedAt: daysAgo(8), remindedDay: 3 }).milestone).toBe(7);
  });

  it("مفيش مبلغ مستحق = مافيش تنبيه", () => {
    expect(check({ amountDue: 0 })).toMatchObject({
      milestone: null,
      skip: "nothing_due",
    });
  });

  it("الأوردر مش مرتجع بعد التسليم = مالناش دعوة", () => {
    for (const s of ["delivered", "returned", "shipped", null]) {
      expect(check({ orderStatus: s }), String(s)).toMatchObject({
        milestone: null,
        skip: "not_returned",
      });
    }
  });
});

describe("رسالة التنبيه", () => {
  it("بتقول المبلغ والعميل والحل", () => {
    const m = refundReminderMessage({
      orderNumber: "1359",
      customerName: "شيماء خالد",
      customerPhone: "01001234567",
      amount: 1298,
      days: 4,
    });
    expect(m).toContain("لسه مارجّعتش فلوسه");
    expect(m).toContain("1359");
    expect(m).toContain("شيماء خالد");
    expect(m).toContain("1298 جنيه");
    expect(m).toContain("من 4 يوم");
    expect(m).toContain("أكّد");
  });

  it("أول يوم بتقول امبارح مش يوم واحد", () => {
    const m = refundReminderMessage({
      orderNumber: "1",
      customerName: "س",
      customerPhone: null,
      amount: 100,
      days: 1,
    });
    expect(m).toContain("امبارح");
  });
});
