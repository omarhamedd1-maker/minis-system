import { describe, it, expect } from "vitest";
import { planResync, resyncSummary, type ResyncInput } from "./order-resync";

const input = (x: Partial<ResyncInput> = {}): ResyncInput => ({
  orderStatus: "confirmed",
  bostaTracking: null,
  ourLines: [{ variantId: "v1", quantity: 1, salePrice: 649 }],
  ourDiscount: 0,
  ourShipping: 80,
  shopLines: [
    { shopifyVariantId: "s1", title: "شكل", quantity: 1, unitPrice: 649 },
    { shopifyVariantId: "s2", title: "شكل تاني", quantity: 1, unitPrice: 499 },
  ],
  shopTotal: 1228,
  variantMap: { s1: "v1", s2: "v2" },
  ...x,
});

describe("مزامنة تعديل الأوردر", () => {
  it("⚠️ الحالة الحقيقية — #1447 عندنا ٧٢٩ وشوبيفاي ١٢٢٨", () => {
    const p = planResync(input());
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.before).toBe(729);
    expect(p.after).toBe(1228);
    expect(p.diff).toBe(499);
    expect(p.lines).toHaveLength(2);
  });

  it("التنقيص برضه تعديل", () => {
    const p = planResync(
      input({ shopLines: [{ shopifyVariantId: "s1", title: "شكل", quantity: 1, unitPrice: 400 }] })
    );
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.diff).toBe(-249);
  });

  it("تغيير الكمية بيتمسك", () => {
    const p = planResync(
      input({ shopLines: [{ shopifyVariantId: "s1", title: "شكل", quantity: 3, unitPrice: 649 }] })
    );
    if (p.ok) expect(p.lines[0].quantity).toBe(3);
    expect(p.ok).toBe(true);
  });

  it("⚠️⚠️ الأوردر اللي راح لبوسطة مايتلمسش", () => {
    const p = planResync(input({ bostaTracking: "123456" }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("بوسطة");
  });

  it("⚠️ الحالات المقفولة مايتلمسوش", () => {
    for (const s of ["delivered", "returned", "returned_after_delivery", "cancelled"]) {
      const p = planResync(input({ orderStatus: s }));
      expect(p.ok).toBe(false);
    }
  });

  it("⚠️⚠️ الشكل اللي مش عندنا بيوقف كل حاجة", () => {
    const p = planResync(input({ variantMap: { s1: "v1" } }));
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.reason).toContain("شكل تاني");
      expect(p.reason).toContain("هات المنتجات");
    }
  });

  it("⚠️ مفيش فرق = مفيش شغل", () => {
    const p = planResync(
      input({ shopLines: [{ shopifyVariantId: "s1", title: "شكل", quantity: 1, unitPrice: 649 }] })
    );
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("مطابق");
  });

  it("⚠️ فرق جنيه تقريب مش تعديل", () => {
    const p = planResync(
      input({ shopLines: [{ shopifyVariantId: "s1", title: "شكل", quantity: 1, unitPrice: 650 }] })
    );
    expect(p.ok).toBe(false);
  });

  it("البند اللي اتشال عند شوبيفاي (كمية صفر) بيتشال", () => {
    const p = planResync(
      input({
        ourLines: [
          { variantId: "v1", quantity: 1, salePrice: 649 },
          { variantId: "v2", quantity: 1, salePrice: 499 },
        ],
        shopLines: [
          { shopifyVariantId: "s1", title: "شكل", quantity: 1, unitPrice: 649 },
          { shopifyVariantId: "s2", title: "شكل تاني", quantity: 0, unitPrice: 499 },
        ],
      })
    );
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.lines).toHaveLength(1);
  });

  it("شوبيفاي من غير بنود = مافيش شغل", () => {
    const p = planResync(input({ shopLines: [] }));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("بنود");
  });

  it("الخصم والشحن بتوعنا بيفضلوا زي ما هما", () => {
    const p = planResync(input({ ourDiscount: 100, ourShipping: 80 }));
    // ١١٤٨ − ١٠٠ + ٨٠
    if (p.ok) expect(p.after).toBe(1128);
    expect(p.ok).toBe(true);
  });

  it("الأرقام السالبة بتتصفّر", () => {
    const p = planResync(
      input({ shopLines: [{ shopifyVariantId: "s1", title: "شكل", quantity: 1, unitPrice: -50 }] })
    );
    if (p.ok) expect(p.lines[0].salePrice).toBe(0);
  });

  it("الجملة بتقول الفرق في أي اتجاه", () => {
    expect(resyncSummary(planResync(input()))).toContain("هيزوّد 499");
    const down = planResync(
      input({ shopLines: [{ shopifyVariantId: "s1", title: "شكل", quantity: 1, unitPrice: 400 }] })
    );
    expect(resyncSummary(down)).toContain("هينقّص 249");
  });

  it("والسبب بيتعرض لما ماينفعش", () => {
    expect(resyncSummary(planResync(input({ bostaTracking: "x" })))).toContain(
      "بوسطة"
    );
  });
});
