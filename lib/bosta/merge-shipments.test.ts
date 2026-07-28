import { describe, expect, it } from "vitest";
import { mergeShipments, sortByCreated } from "./merge-shipments";

const D = (over: Record<string, unknown> = {}) => ({
  trackingNumber: "t1",
  state: { value: "Delivered" },
  cod: 1000,
  allowToOpenPackage: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

describe("ترتيب الشحنات", () => {
  it("من الأقدم للأحدث", () => {
    const out = sortByCreated([
      D({ trackingNumber: "b", createdAt: "2026-07-05T00:00:00.000Z" }),
      D({ trackingNumber: "a", createdAt: "2026-07-01T00:00:00.000Z" }),
      D({ trackingNumber: "c", createdAt: "2026-07-09T00:00:00.000Z" }),
    ]);
    expect(out.map((d) => d.trackingNumber)).toEqual(["a", "b", "c"]);
  });

  it("اللي مالهاش تاريخ بتتحط الأول", () => {
    const out = sortByCreated([D({ trackingNumber: "b" }), D({ trackingNumber: "a", createdAt: null })]);
    expect(out[0].trackingNumber).toBe("a");
  });
});

describe("دمج شحنات الأوردر الواحد", () => {
  it("الحالة ورقم التتبع من أحدث شحنة", () => {
    const m = mergeShipments(
      [
        D({ trackingNumber: "قديمة", createdAt: "2026-07-01T00:00:00.000Z", state: { value: "Returned to origin" } }),
        D({ trackingNumber: "أحدث", createdAt: "2026-07-20T00:00:00.000Z", state: { value: "Delivered" } }),
      ],
      1000,
      "shipped"
    )!;
    expect(m.latest.trackingNumber).toBe("أحدث");
    expect(m.latest.state?.value).toBe("Delivered");
    expect(m.count).toBe(2);
  });

  it("التحصيل بيتجمع من كل الشحنات", () => {
    const m = mergeShipments(
      [D({ cod: 1000 }), D({ cod: 500, createdAt: "2026-07-20T00:00:00.000Z" })],
      1000,
      "shipped"
    )!;
    expect(m.totalCod).toBe(1500);
  });

  it("الرسوم بتتجمع — لأن بوسطة بتحاسب على كل شحنة", () => {
    const one = mergeShipments([D({ cod: 1000 })], 1000, "shipped")!;
    const two = mergeShipments(
      [D({ cod: 1000 }), D({ cod: 1000, createdAt: "2026-07-20T00:00:00.000Z" })],
      1000,
      "shipped"
    )!;
    expect(two.totalFee).toBe(Math.round(one.totalFee * 2 * 100) / 100);
  });

  it("كل شحنة بترسوم حسب حالتها هي — المرتجع أقل", () => {
    const merged = mergeShipments(
      [
        D({ cod: 0, state: { value: "Returned to origin" } }),
        D({ cod: 1000, createdAt: "2026-07-20T00:00:00.000Z" }),
      ],
      1000,
      "shipped"
    )!;
    // المرتجع: (7 + 10) × 1.14 = 19.38 | المتسلّمة: (7 + 13 + 10) × 1.14 = 34.20
    expect(merged.totalFee).toBe(53.58);
  });

  it("شحنة واحدة بترجّع نفس رسومها من غير تغيير", () => {
    const m = mergeShipments([D({ cod: 1000 })], 1000, "shipped")!;
    expect(m.count).toBe(1);
    expect(m.totalCod).toBe(1000);
    expect(m.totalFee).toBe(34.2);
  });

  it("ليستة فاضية بترجّع مفيش", () => {
    expect(mergeShipments([], 1000, "shipped")).toBe(null);
  });
});
