import { describe, expect, it } from "vitest";
import { moneyAtCourier, workDaysBetween } from "./money-at-courier";

const o = (cod: number, deliveredAt: string | null) => ({ cod, deliveredAt });

describe("أيام الشغل", () => {
  it("الجمعة والسبت مابيتحسبوش", () => {
    // ٢٠٢٦-٠٩-٢١ الاتنين → ٢٠٢٦-٠٩-٢٨ الاتنين = ٥ أيام شغل
    expect(workDaysBetween("2026-09-21", "2026-09-28")).toBe(5);
  });

  it("نفس اليوم = صفر", () => {
    expect(workDaysBetween("2026-09-21", "2026-09-21")).toBe(0);
  });

  it("التاريخ الغلط مايوقّعش الحساب", () => {
    expect(workDaysBetween("كلام", "2026-09-21")).toBe(0);
  });
});

describe("فلوس عند بوسطة", () => {
  const orders = [
    o(1000, "2026-09-18"), // قبل آخر تحويل — فلوسه وصلت
    o(2000, "2026-09-22"), // بعده
    o(500, "2026-09-23"),
    o(300, null), // من غير تاريخ تسليم
    o(0, "2026-09-24"), // من غير تحصيل
  ];

  it("⚠️⚠️ بيحسب اللي اتسلّم بعد آخر تحويل بس", () => {
    const r = moneyAtCourier({ orders, lastPayoutDate: "2026-09-21", today: "2026-09-23" });
    expect(r.total).toBe(2500);
    expect(r.count).toBe(2);
  });

  it("مفيش أوردرات بعد آخر تحويل = صفر — ودي الحالة الحقيقية على مينيز", () => {
    const r = moneyAtCourier({
      orders: [o(1000, "2026-09-18")],
      lastPayoutDate: "2026-09-21",
      today: "2026-09-22",
    });
    expect(r).toMatchObject({ total: 0, count: 0, warning: null });
  });

  it("تحت الحد مفيش تنبيه", () => {
    // ٢١ الاتنين → ٢٥ الجمعة: التلاتا والأربع والخميس بس = ٣
    const r = moneyAtCourier({ orders, lastPayoutDate: "2026-09-21", today: "2026-09-25" });
    expect(r.workDaysSincePayout).toBe(3);
    expect(r.warning).toBeNull();
  });

  it("⚠️⚠️ فوق الحد بيقول السبب — الرقم بيكبر لما التحويل يقف", () => {
    const r = moneyAtCourier({ orders, lastPayoutDate: "2026-09-21", today: "2026-09-29" });
    expect(r.workDaysSincePayout).toBe(6);
    expect(r.warning).toContain("٦ يوم شغل".replace("٦", "6"));
    expect(r.warning).toContain("جيميل");
  });

  it("⚠️ مفيش تحويلات خالص = الرقم بيتقال ومعاه إنه مش «عند بوسطة»", () => {
    const r = moneyAtCourier({ orders, lastPayoutDate: null, today: "2026-09-23" });
    expect(r.total).toBe(3500);
    expect(r.count).toBe(3);
    expect(r.workDaysSincePayout).toBeNull();
    expect(r.warning).toContain("مفيش ولا تحويل");
  });
});
