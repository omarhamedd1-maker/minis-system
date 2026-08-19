import { describe, it, expect } from "vitest";
import {
  shippingByDay,
  cairoWeekday,
  MIN_SHIPMENTS_PER_DAY,
  type TimingOrder,
} from "./shipping-timing";

/** شحنات كلها في نفس اليوم من الأسبوع */
function shipments(opts: {
  /** يوم في أغسطس ٢٠٢٦ — ٢ أغسطس ٢٠٢٦ هو الأحد */
  startDay: number;
  count: number;
  status: string;
  lead?: number;
}): TimingOrder[] {
  const out: TimingOrder[] = [];
  for (let i = 0; i < opts.count; i++) {
    // نفس يوم الأسبوع كل مرة: بنزوّد ٧ أيام
    const created = new Date(Date.UTC(2026, 7, opts.startDay + i * 7, 9, 0));
    const delivered = new Date(created.getTime() + (opts.lead ?? 2) * 86_400_000);
    out.push({
      orderStatus: opts.status,
      bostaTracking: `T${opts.startDay}-${i}`,
      bostaCreatedAt: created.toISOString(),
      deliveredAt: opts.status === "delivered" ? delivered.toISOString() : null,
    });
  }
  return out;
}

describe("يوم الشحن", () => {
  it("بيقرا اليوم بتوقيت القاهرة مش العالمي", () => {
    // ٩ أغسطس ٢٠٢٦ الساعة ٢٢:٣٠ عالمي = ١٠ أغسطس ١:٣٠ في القاهرة
    expect(cairoWeekday("2026-08-09T22:30:00Z")).toBe(1); // الاتنين
    expect(cairoWeekday("2026-08-09T12:00:00Z")).toBe(0); // الأحد
  });

  it("التاريخ الفاضي أو الغلط بيرجّع فاضي", () => {
    expect(cairoWeekday(null)).toBeNull();
    expect(cairoWeekday("مش تاريخ")).toBeNull();
  });

  it("بيحسب نسبة التسليم لكل يوم", () => {
    const rep = shippingByDay([
      ...shipments({ startDay: 2, count: 8, status: "delivered" }),
      ...shipments({ startDay: 2, count: 2, status: "returned" }),
    ]);
    const sunday = rep.rows[0];
    expect(sunday.name).toBe("الأحد");
    expect(sunday.shipped).toBe(10);
    expect(Math.round(sunday.deliveryRate)).toBe(80);
  });

  it("بيطلّع أحسن يوم وأوحش يوم", () => {
    const rep = shippingByDay([
      ...shipments({ startDay: 2, count: 10, status: "delivered" }),
      ...shipments({ startDay: 6, count: 5, status: "delivered" }),
      ...shipments({ startDay: 6, count: 5, status: "returned" }),
    ]);
    expect(rep.best?.name).toBe("الأحد");
    expect(rep.worst?.name).toBe("الخميس");
  });

  it("اليوم اللي شحناته قليلة مايدخلش المقارنة", () => {
    const rep = shippingByDay([
      ...shipments({ startDay: 2, count: 20, status: "delivered" }),
      ...shipments({ startDay: 6, count: MIN_SHIPMENTS_PER_DAY - 1, status: "returned" }),
    ]);
    // الخميس كله راجع، بس شحناته أقل من الحد — فمفيش مقارنة أصلًا
    expect(rep.best).toBeNull();
    expect(rep.worst).toBeNull();
    expect(rep.rows[4].shipped).toBe(MIN_SHIPMENTS_PER_DAY - 1);
  });

  it("اللي لسه في الطريق مايتحسبش", () => {
    const rep = shippingByDay([
      ...shipments({ startDay: 2, count: 10, status: "delivered" }),
      ...shipments({ startDay: 2, count: 30, status: "out_for_delivery" }),
    ]);
    expect(rep.shipped).toBe(10);
    expect(rep.overall).toBe(100);
  });

  it("اللي ماعدّاش على بوسطة مايتحسبش", () => {
    const rep = shippingByDay([
      { orderStatus: "delivered", bostaCreatedAt: "2026-08-02T09:00:00Z", deliveredAt: "2026-08-04T09:00:00Z" },
      { orderStatus: "delivered", bostaTracking: "  ", bostaCreatedAt: "2026-08-02T09:00:00Z" },
    ]);
    expect(rep.shipped).toBe(0);
    expect(rep.overall).toBe(0);
  });

  it("متوسط أيام الطريق بيتحسب من المسلّم بس", () => {
    const rep = shippingByDay([
      ...shipments({ startDay: 2, count: 10, status: "delivered", lead: 3 }),
      ...shipments({ startDay: 2, count: 10, status: "returned" }),
    ]);
    expect(rep.rows[0].leadDays).toBe(3);
  });

  it("تسليم قبل الشحن مابينزّلش المتوسط", () => {
    const rep = shippingByDay([
      ...shipments({ startDay: 2, count: 10, status: "delivered", lead: 2 }),
      {
        orderStatus: "delivered",
        bostaTracking: "X",
        bostaCreatedAt: "2026-08-16T09:00:00Z",
        deliveredAt: "2026-08-10T09:00:00Z",
      },
    ]);
    expect(rep.rows[0].leadDays).toBe(2);
    expect(rep.rows[0].shipped).toBe(11);
  });

  it("مافيش شحنات = تقرير فاضي من غير قسمة على صفر", () => {
    const rep = shippingByDay([]);
    expect(rep.shipped).toBe(0);
    expect(rep.overall).toBe(0);
    expect(rep.best).toBeNull();
    expect(rep.rows).toHaveLength(7);
    expect(rep.rows.every((r) => r.leadDays === null)).toBe(true);
  });
});
