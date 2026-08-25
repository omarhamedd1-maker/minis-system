import { describe, expect, it } from "vitest";
import {
  customerKey,
  digitsOnly,
  phoneKey,
  planOrderImport,
  statusFromShopify,
  type ShopifyOrderIn,
} from "./order-import-plan";

const order = (over: Partial<ShopifyOrderIn> = {}): ShopifyOrderIn => ({
  shopifyOrderId: "S1",
  orderNumber: "1001",
  createdAt: "2026-07-01T00:00:00Z",
  cancelled: false,
  fulfilled: false,
  discount: 0,
  shipping: 0,
  customer: {
    shopifyCustomerId: "C1",
    fullName: "أحمد",
    phone: "01005361491",
    address: "القاهرة",
  },
  lines: [{ shopifyVariantId: "V1", title: "كرسي", quantity: 1, unitPrice: 1000 }],
  ...over,
});

const KNOWN = new Set(["V1", "V2"]);

describe("حالة الأوردر", () => {
  it("الملغي ملغي", () => {
    expect(statusFromShopify(order({ cancelled: true }))).toBe("cancelled");
  });

  it("الملغي أقوى من المشحون", () => {
    expect(statusFromShopify(order({ cancelled: true, fulfilled: true }))).toBe(
      "cancelled"
    );
  });

  it("المشحون بيتعتبر اتسلّم", () => {
    expect(statusFromShopify(order({ fulfilled: true }))).toBe("delivered");
  });

  it("**أي حاجة تانية بتيجي جديد** — الحالة بتحرّك أرباح فمابنخمّنش", () => {
    expect(statusFromShopify(order())).toBe("new");
  });
});

describe("منع التكرار", () => {
  it("الأوردر الموجود عندنا بيتعدّى", () => {
    const plan = planOrderImport(
      [order({ shopifyOrderId: "S1" })],
      [{ shopifyOrderId: "S1", orderNumber: "9999" }],
      [],
      KNOWN
    );
    expect(plan.toImport).toEqual([]);
    expect(plan.alreadyHere).toBe(1);
  });

  it("**الأوردر المستورد قبل كده مايتجابش تاني**", () => {
    // الأوردر اللي اتستورد رقمه عندنا `import-1001` مش رقم شوبيفاي الحقيقي.
    // من غير المقارنة برقم الأوردر كنا هنجيبه تاني، ويبقى عندك أوردرين
    // رقمهم ١٠٠١ وإيراد مضاعف.
    const plan = planOrderImport(
      [order({ shopifyOrderId: "S-REAL", orderNumber: "1001" })],
      [{ shopifyOrderId: "import-1001", orderNumber: "1001" }],
      [],
      KNOWN
    );
    expect(plan.toImport).toEqual([]);
    expect(plan.alreadyHere).toBe(1);
  });

  it("ونفس الحكاية مع الأوردر اليدوي", () => {
    const plan = planOrderImport(
      [order({ shopifyOrderId: "S-REAL", orderNumber: "1001" })],
      [{ shopifyOrderId: "manual-abc", orderNumber: "1001" }],
      [],
      KNOWN
    );
    expect(plan.alreadyHere).toBe(1);
  });

  it("الأوردرات اليدوية والمستوردة مابتتحسبش أرقام شوبيفاي", () => {
    const plan = planOrderImport(
      [order({ shopifyOrderId: "S1" })],
      [
        { shopifyOrderId: "manual-abc", orderNumber: "8888" },
        { shopifyOrderId: "import-7777", orderNumber: "7777" },
      ],
      [],
      KNOWN
    );
    expect(plan.toImport).toHaveLength(1);
  });
});

describe("المنتجات الناقصة", () => {
  it("**بند منتجه مش عندنا بيوقف الأوردر كله**", () => {
    // أوردر بإجمالي ناقص أسوأ من أوردر ماجاش
    const plan = planOrderImport(
      [
        order({
          lines: [
            { shopifyVariantId: "V1", title: "كرسي", quantity: 1, unitPrice: 1000 },
            { shopifyVariantId: "V9", title: "ترابيزة", quantity: 1, unitPrice: 2000 },
          ],
        }),
      ],
      [],
      [],
      KNOWN
    );
    expect(plan.toImport).toEqual([]);
    expect(plan.missingProducts).toEqual([
      { orderNumber: "1001", missing: ["ترابيزة"] },
    ]);
  });

  it("البند اللي مالوش رقم شكل بيتحسب ناقص", () => {
    const plan = planOrderImport(
      [
        order({
          lines: [
            { shopifyVariantId: null, title: "حاجة", quantity: 1, unitPrice: 100 },
          ],
        }),
      ],
      [],
      [],
      KNOWN
    );
    expect(plan.missingProducts).toHaveLength(1);
  });

  it("الاسم المكرر بيتقال مرة واحدة", () => {
    const plan = planOrderImport(
      [
        order({
          lines: [
            { shopifyVariantId: "V9", title: "ترابيزة", quantity: 1, unitPrice: 1 },
            { shopifyVariantId: "V8", title: "ترابيزة", quantity: 1, unitPrice: 1 },
          ],
        }),
      ],
      [],
      [],
      KNOWN
    );
    expect(plan.missingProducts[0].missing).toEqual(["ترابيزة"]);
  });

  it("الأوردر من غير بنود بيتقال لوحده", () => {
    const plan = planOrderImport([order({ lines: [] })], [], [], KNOWN);
    expect(plan.noLines).toEqual(["1001"]);
    expect(plan.toImport).toEqual([]);
  });
});

describe("العملاء", () => {
  it("بيلاقي العميل برقمه عند شوبيفاي", () => {
    const plan = planOrderImport(
      [order()],
      [],
      [{ id: "our-c1", shopifyCustomerId: "C1", phone: null }],
      KNOWN
    );
    expect(plan.toImport[0].customerId).toBe("our-c1");
    expect(plan.newCustomers).toBe(0);
  });

  it("ولو مالوش رقم بيلاقيه بالتليفون", () => {
    const plan = planOrderImport(
      [order({ customer: { shopifyCustomerId: null, fullName: "أحمد", phone: "+201005361491", address: null } })],
      [],
      [{ id: "our-c1", shopifyCustomerId: null, phone: "01005361491" }],
      KNOWN
    );
    expect(plan.toImport[0].customerId).toBe("our-c1");
  });

  it("عميل جديد بيتعدّ مرة واحدة حتى لو ليه أوردرين", () => {
    const plan = planOrderImport(
      [
        order({ shopifyOrderId: "S1", orderNumber: "1001" }),
        order({ shopifyOrderId: "S2", orderNumber: "1002" }),
      ],
      [],
      [],
      KNOWN
    );
    expect(plan.toImport).toHaveLength(2);
    expect(plan.newCustomers).toBe(1);
  });

  it("**الأوردرات من غير تليفون كل واحد ياخد عميله لوحده**", () => {
    // كانت بتتجمّع كلها في عميل واحد لأن `??` بيعدّي على null بس والنص
    // الفاضي بيعدّي منه — يعني ناس مالهاش علاقة ببعض تبقى شخص واحد
    const noPhone = { shopifyCustomerId: null, fullName: null, phone: null, address: null };
    const plan = planOrderImport(
      [
        order({ shopifyOrderId: "S1", orderNumber: "1001", customer: noPhone }),
        order({ shopifyOrderId: "S2", orderNumber: "1002", customer: noPhone }),
        order({ shopifyOrderId: "S3", orderNumber: "1003", customer: noPhone }),
      ],
      [],
      [],
      KNOWN
    );
    expect(plan.toImport).toHaveLength(3);
    expect(plan.newCustomers).toBe(3);
  });

  it("مفتاح العميل بيرجع لرقم الأوردر لو مافيش تليفون", () => {
    expect(customerKey(order({ orderNumber: "1001", customer: null }))).toBe(
      "order:1001"
    );
    // الجلب الحقيقي مابياخدش رقم العميل من شوبيفاي، فالمفتاح بيبقى التليفون
    expect(
      customerKey(
        order({
          customer: {
            shopifyCustomerId: null,
            fullName: "أحمد",
            phone: "+201005361491",
            address: null,
          },
        })
      )
    ).toBe("005361491");
  });

  it("التليفون القصير مابيتطابقش", () => {
    const plan = planOrderImport(
      [order({ customer: { shopifyCustomerId: null, fullName: "أحمد", phone: "123", address: null } })],
      [],
      [{ id: "our-c1", shopifyCustomerId: null, phone: "123" }],
      KNOWN
    );
    expect(plan.toImport[0].customerId).toBeNull();
  });
});

describe("الإجمالي", () => {
  it("بنود ناقص خصم زائد شحن", () => {
    const plan = planOrderImport(
      [
        order({
          discount: 100,
          shipping: 90,
          lines: [
            { shopifyVariantId: "V1", title: "كرسي", quantity: 2, unitPrice: 1000 },
          ],
        }),
      ],
      [],
      [],
      KNOWN
    );
    expect(plan.toImport[0].total).toBe(1990);
  });

  it("مابينزلش تحت الصفر", () => {
    const plan = planOrderImport(
      [order({ discount: 99999 })],
      [],
      [],
      KNOWN
    );
    expect(plan.toImport[0].total).toBe(0);
  });
});

describe("مفتاح التليفون", () => {
  it("بيسيب الأرقام بس", () => {
    expect(digitsOnly("+20 100 536-1491")).toBe("201005361491");
    expect(digitsOnly(null)).toBe("");
  });

  it("**آخر ٩ أرقام** — عشان مفتاح الدولة والصفر البادئ يمشوا مع بعض", () => {
    // شوبيفاي بتدي الرقم عالمي وإحنا مخزنينه محلي — والمفتاح بقى واحد
    // للسيستم كله (نفس مفتاح مطابقة بوسطة، توحيد ٢٤ أغسطس)
    expect(phoneKey("+201005361491")).toBe("005361491");
    expect(phoneKey("01005361491")).toBe("005361491");
    expect(phoneKey("+20 100 536-1491")).toBe(phoneKey("01005361491"));
  });

  it("الرقم القصير مالوش مفتاح", () => {
    expect(phoneKey("123")).toBe("");
    expect(phoneKey(null)).toBe("");
  });
});

describe("دفعة كاملة", () => {
  it("بتتفرز صح", () => {
    const plan = planOrderImport(
      [
        order({ shopifyOrderId: "S1", orderNumber: "1001" }),
        order({ shopifyOrderId: "S2", orderNumber: "1002" }),
        order({ shopifyOrderId: "S3", orderNumber: "1003", lines: [] }),
        order({
          shopifyOrderId: "S4",
          orderNumber: "1004",
          lines: [{ shopifyVariantId: "V9", title: "مش موجود", quantity: 1, unitPrice: 1 }],
        }),
      ],
      [{ shopifyOrderId: "S2", orderNumber: "9998" }],
      [],
      KNOWN
    );
    expect(plan.toImport).toHaveLength(1);
    expect(plan.alreadyHere).toBe(1);
    expect(plan.noLines).toHaveLength(1);
    expect(plan.missingProducts).toHaveLength(1);
  });
});

// ==========================================================================
// مزامنة الإلغاء — الأوردر اللي اتلغى عند شوبيفاي بعد ما دخل عندنا
// --------------------------------------------------------------------------
// الاستيراد كان **بيضيف بس**، فالإلغاء ماكانش بيوصل خالص. اتلقى ٦ أوردرات
// في مينيز بإجمالي ١١٬٩١٥ ج مكتوب عندهم «اتسلّم» وهم ملغيين من العميل عند
// شوبيفاي ومحصلش ليهم شحن (١٨ أغسطس ٢٠٢٦).
// ==========================================================================

const here = (over: Partial<Parameters<typeof planOrderImport>[1][number]> = {}) => ({
  shopifyOrderId: "S1",
  orderNumber: "1001",
  id: "row-1",
  orderStatus: "delivered",
  bostaTracking: null,
  ...over,
});

describe("الإلغاء من شوبيفاي", () => {
  it("الملغي عند شوبيفاي واللي مالوش شحنة **بيتقفل عندنا**", () => {
    const plan = planOrderImport(
      [order({ cancelled: true, cancelledAt: "2026-07-02T10:00:00Z" })],
      [here()],
      [],
      KNOWN
    );
    // **تاريخ شوبيفاي بيتنقل زي ما هو** — مش تاريخ اللفة
    expect(plan.toCancel).toEqual([
      { id: "row-1", orderNumber: "1001", was: "delivered", at: "2026-07-02T10:00:00Z" },
    ]);
    expect(plan.cancelledButShipped).toHaveLength(0);
  });

  it("**اللي ليه شحنة بوسطة مابيتلمسش** — بيتعرض للمراجعة بس", () => {
    const plan = planOrderImport(
      [order({ cancelled: true })],
      [here({ bostaTracking: "77778888" })],
      [],
      KNOWN
    );
    expect(plan.toCancel).toHaveLength(0);
    expect(plan.cancelledButShipped).toEqual([
      { orderNumber: "1001", was: "delivered", tracking: "77778888" },
    ]);
  });

  it("الملغي عندنا خلاص مابيتكررش", () => {
    const plan = planOrderImport(
      [order({ cancelled: true })],
      [here({ orderStatus: "cancelled" })],
      [],
      KNOWN
    );
    expect(plan.toCancel).toHaveLength(0);
  });

  it("**`returned_after_delivery` محمي** — ده قرار موظف مش إلغاء شوبيفاي", () => {
    const plan = planOrderImport(
      [order({ cancelled: true })],
      [here({ orderStatus: "returned_after_delivery" })],
      [],
      KNOWN
    );
    expect(plan.toCancel).toHaveLength(0);
    expect(plan.cancelledButShipped).toHaveLength(0);
  });

  it("مش ملغي عند شوبيفاي؟ مافيش حاجة تتعمل", () => {
    const plan = planOrderImport([order()], [here()], [], KNOWN);
    expect(plan.toCancel).toHaveLength(0);
    expect(plan.alreadyHere).toBe(1);
  });

  it("بيوصل للصف حتى لما المطابقة بالرقم مش بمعرّف شوبيفاي", () => {
    const plan = planOrderImport(
      [order({ shopifyOrderId: "S9", orderNumber: "1001", cancelled: true })],
      [here({ shopifyOrderId: "import-1001", orderNumber: "1001", id: "row-9" })],
      [],
      KNOWN
    );
    expect(plan.toCancel).toEqual([
      { id: "row-9", orderNumber: "1001", was: "delivered", at: null },
    ]);
  });
});
