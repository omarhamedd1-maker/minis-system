import { describe, expect, it } from "vitest";
import { describeUndo, payloadCount, type ImportPayload } from "./import-runs";

describe("عدّ اللي هيترجع", () => {
  it("الحمولة الفاضية = صفر", () => {
    expect(payloadCount({})).toBe(0);
  });

  it("بيجمع كل الأنواع", () => {
    const p: ImportPayload = {
      orders: ["o1", "o2"],
      customers: ["c1"],
      products: ["p1"],
      variants: ["v1", "v2"],
      trackings: [{ orderId: "o3" }],
      costs: [{ variantId: "v3", previous: 100 }],
    };
    expect(payloadCount(p)).toBe(8);
  });
});

describe("وصف التراجع", () => {
  it("بيوصف الأوردرات والعملاء", () => {
    const lines = describeUndo({ orders: ["o1", "o2"], customers: ["c1"] });
    expect(lines[0]).toBe("2 أوردر هيتمسحوا");
    expect(lines[1]).toContain("1 عميل");
  });

  it("**بيوضّح إن العميل بيتمسح بشرط**", () => {
    // ممكن يكون عنده أوردر قديم من قبل الاستيراد، ومسحه هيضيّع تاريخه
    const lines = describeUndo({ customers: ["c1"] });
    expect(lines[0]).toContain("مالوش أوردرات تانية");
  });

  it("بيوصف فك الشحنات", () => {
    expect(describeUndo({ trackings: [{ orderId: "o1" }] })[0]).toContain(
      "رقم تتبع هيتفكّ"
    );
  });

  it("بيوصف رجوع التكاليف", () => {
    expect(describeUndo({ costs: [{ variantId: "v1", previous: 50 }] })[0]).toContain(
      "لقيمتها القديمة"
    );
  });

  it("الفاضية مالهاش وصف", () => {
    expect(describeUndo({})).toEqual([]);
  });

  it("مابيقولش على اللي مش موجود", () => {
    const lines = describeUndo({ orders: ["o1"] });
    expect(lines).toHaveLength(1);
  });
});
