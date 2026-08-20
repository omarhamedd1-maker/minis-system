import { describe, it, expect } from "vitest";
import {
  deliveryEta,
  durations,
  etaCopy,
  etaLine,
  MIN_SAMPLE,
  OUTLIER_DAYS,
  type Shipment,
} from "./delivery-eta";

/** شحنة مدتها `days` يوم */
const s = (days: number): Shipment => ({
  shippedAt: "2026-08-01T00:00:00Z",
  deliveredAt: new Date(
    new Date("2026-08-01T00:00:00Z").getTime() + days * 86_400_000
  ).toISOString(),
});

/** `n` شحنة كل واحدة `days` */
const many = (n: number, days: number) => Array.from({ length: n }, () => s(days));

describe("وقت الوصول المتوقع", () => {
  it("⚠️ الوعد من الشريحة ٧٥٪ مش من الوسيط", () => {
    // ٣٠ شحنة: ٢٠ في يومين و١٠ في خمسة
    const e = deliveryEta([...many(20, 2), ...many(10, 5)]);
    expect(e.median).toBe(2);
    expect(e.days).toBe(5);
  });

  it("⚠️ التقريب لفوق — ١٫٩ يوم بتبقى يومين", () => {
    expect(deliveryEta(many(MIN_SAMPLE, 1.9)).days).toBe(2);
  });

  it("⚠️ أقل من يوم بتفضل يوم مش صفر", () => {
    expect(deliveryEta(many(MIN_SAMPLE, 0.2)).days).toBe(1);
  });

  it("⚠️ الأرقام القليلة مابتوعدش", () => {
    const e = deliveryEta(many(MIN_SAMPLE - 1, 2));
    expect(e.days).toBeNull();
    expect(e.median).toBeNull();
    expect(e.sample).toBe(MIN_SAMPLE - 1);
  });

  it("⚠️ الشحنة الشاذة بتتشال من الحسبة", () => {
    const d = durations([s(2), s(OUTLIER_DAYS + 1)]);
    expect(d).toEqual([2]);
  });

  it("⚠️ التسليم قبل الشحن تاريخ غلط مش مدة سالبة", () => {
    const bad: Shipment = {
      shippedAt: "2026-08-10T00:00:00Z",
      deliveredAt: "2026-08-01T00:00:00Z",
    };
    expect(durations([bad])).toEqual([]);
  });

  it("التواريخ الناقصة والغلط بتتشال", () => {
    const rows: Shipment[] = [
      { shippedAt: null, deliveredAt: "2026-08-02T00:00:00Z" },
      { shippedAt: "2026-08-01T00:00:00Z", deliveredAt: null },
      { shippedAt: "مش تاريخ", deliveredAt: "2026-08-02T00:00:00Z" },
    ];
    expect(durations(rows)).toEqual([]);
  });

  it("المدد بترجع مرتّبة", () => {
    expect(durations([s(5), s(1), s(3)])).toEqual([1, 3, 5]);
  });

  it("مافيش شحنات = مافيش وعد ومفيش قسمة على صفر", () => {
    expect(deliveryEta([])).toEqual({ days: null, median: null, sample: 0 });
  });

  it("جملة العميل إنجليزي", () => {
    expect(etaCopy(deliveryEta(many(MIN_SAMPLE, 2)), false)).toBe(
      "Usually arrives within 2 days."
    );
    expect(etaCopy(deliveryEta(many(MIN_SAMPLE, 1)), false)).toBe(
      "Usually arrives within a day."
    );
  });

  it("⚠️ اللي وصل مايتقالّوش هيوصل إمتى", () => {
    expect(etaCopy(deliveryEta(many(MIN_SAMPLE, 2)), true)).toBeNull();
  });

  it("⚠️ مافيش رقم = مافيش سطر، مش رقم افتراضي", () => {
    expect(etaCopy(deliveryEta([]), false)).toBeNull();
  });

  it("السطر الداخلي بيقول العيّنة", () => {
    const line = etaLine(deliveryEta(many(30, 2)));
    expect(line).toContain("يومين");
    expect(line).toContain("30 شحنة");
  });

  it("السطر الداخلي بيقول لما مافيش كفاية", () => {
    expect(etaLine(deliveryEta(many(3, 2)))).toContain("3 من");
  });
});
