import { describe, expect, it } from "vitest";
import {
  decideSync,
  isoDate,
  sameInstant,
  deliveryOrderNumber,
  type OurOrder,
} from "./reconcile";

const NOW = new Date("2026-07-28T12:00:00.000Z");

/** أوردر متسلّم ومتزامن بالكامل — المزامنة المفروض متغيّرش فيه حاجة */
function syncedOrder(over: Partial<OurOrder> = {}): OurOrder {
  return {
    id: "x",
    order_number: "1360",
    order_status: "delivered",
    delivered_at: "2026-07-22T10:00:00.000Z",
    bosta_tracking: "8550116799",
    bosta_state: "Delivered",
    bosta_cod: 3690,
    bosta_collected: true,
    bosta_shipping_cost: 92.11,
    bosta_exception: null,
    bosta_created_at: null,
    hasCustomerReturn: false,
    productValue: 3600,
    ...over,
  };
}

const deliveredShipment = {
  trackingNumber: "8550116799",
  // الكود ٤٥ = اتسلّمت فعلاً. الرقم مهم جدًا هنا: الكود ٤٦ (رجعت لنا)
  // بيرجّع **نفس النص** "Delivered"، فمن غير الكود مافيش فرق بينهم
  state: { value: "Delivered", code: 45 },
  cod: 3690,
  allowToOpenPackage: true,
};

describe("المزامنة مابتعملش تغيير من غير سبب", () => {
  it("أوردر متزامن بالكامل مايتغيرش فيه حاجة", () => {
    const d = decideSync(deliveredShipment, syncedOrder(), NOW);
    expect(d.changes).toEqual({});
    expect(d.reasons).toEqual([]);
  });

  it("تشغيلها مرتين ورا بعض مايفرقش", () => {
    const order = syncedOrder({ bosta_shipping_cost: 0 });
    const first = decideSync(deliveredShipment, order, NOW);
    expect(first.changes.bosta_shipping_cost).toBe(92.11);

    const after = syncedOrder({ bosta_shipping_cost: 92.11 });
    const second = decideSync(deliveredShipment, after, NOW);
    expect(second.changes).toEqual({});
  });
});

describe("الحالات المقفولة", () => {
  it("أوردر ملغي بإيدنا المزامنة مامتغيرهوش", () => {
    const d = decideSync(
      deliveredShipment,
      syncedOrder({ order_status: "cancelled" }),
      NOW
    );
    expect(d.statusLocked).toBe(true);
    expect(d.changes.order_status).toBeUndefined();
  });

  it("مرتجع بعد التسليم برضه مقفول", () => {
    const d = decideSync(
      deliveredShipment,
      syncedOrder({ order_status: "returned_after_delivery" }),
      NOW
    );
    expect(d.statusLocked).toBe(true);
    expect(d.changes.order_status).toBeUndefined();
  });

  it("بس باقي الخانات بتتحدّث عادي حتى لو الحالة مقفولة", () => {
    const d = decideSync(
      { ...deliveredShipment, cod: 4000 },
      syncedOrder({ order_status: "cancelled" }),
      NOW
    );
    expect(d.changes.bosta_cod).toBe(4000);
  });
});

describe("تاريخ التسليم", () => {
  it("بيتسجّل أول ما الأوردر يبقى متسلّم", () => {
    const d = decideSync(
      deliveredShipment,
      syncedOrder({ order_status: "shipped", delivered_at: null }),
      NOW
    );
    expect(d.changes.order_status).toBe("delivered");
    expect(d.changes.delivered_at).toBe(NOW.toISOString());
  });

  it("مابيتغيّرش لو متسجّل قبل كده", () => {
    const d = decideSync(
      deliveredShipment,
      syncedOrder({ order_status: "shipped" }),
      NOW
    );
    expect(d.changes.delivered_at).toBeUndefined();
  });
});

describe("الرسوم", () => {
  it("بتتحسب للشحنات اللي مع بوسطة", () => {
    const d = decideSync(
      deliveredShipment,
      syncedOrder({ bosta_shipping_cost: null }),
      NOW
    );
    expect(d.changes.bosta_shipping_cost).toBe(92.11);
  });

  it("المرتجع رسومه أقل — مفيش تحصيل ولا تحويل", () => {
    const d = decideSync(
      { ...deliveredShipment, state: { value: "Returned to origin", code: 46 } },
      syncedOrder({ order_status: "shipped", bosta_shipping_cost: null }),
      NOW
    );
    expect(d.changes.bosta_shipping_cost).toBe(30.78);
  });

  it("المرتجع بعد التسليم رسومه كاملة — لأنه اتسلّم فعلاً", () => {
    const d = decideSync(
      { ...deliveredShipment, state: { value: "Returned to origin", code: 46 } },
      syncedOrder({
        order_status: "returned_after_delivery",
        bosta_shipping_cost: null,
      }),
      NOW
    );
    expect(d.changes.bosta_shipping_cost).toBe(92.11);
  });

  it("لو الشحنة مش مسموح تتفتح، رسم الفتح بيتشال", () => {
    const d = decideSync(
      { ...deliveredShipment, allowToOpenPackage: false },
      syncedOrder({ bosta_shipping_cost: null }),
      NOW
    );
    expect(d.changes.bosta_shipping_cost).toBe(84.13); // من غير الـ٧ جنيه
  });
});

describe("سبب وقوف الشحنة", () => {
  it("بيتسجّل لما بوسطة تبعته", () => {
    const d = decideSync(
      { ...deliveredShipment, latestExceptionReason: "العميل مش بيرد" },
      syncedOrder(),
      NOW
    );
    expect(d.changes.bosta_exception).toBe("العميل مش بيرد");
  });

  it("بيتشال لما المشكلة تتحل", () => {
    const d = decideSync(
      deliveredShipment,
      syncedOrder({ bosta_exception: "العميل مش بيرد" }),
      NOW
    );
    expect(d.changes.bosta_exception).toBe(null);
  });
});

describe("قراءة رقم الأوردر من الشحنة", () => {
  it("من بيانات شوبيفاي", () => {
    expect(deliveryOrderNumber({ shopifyInfo: { orderNumber: "#1360" } })).toBe("1360");
  });

  it("من المرجع لما شوبيفاي مش موجود", () => {
    expect(deliveryOrderNumber({ businessReference: "minis: 1360" })).toBe("1360");
  });

  it("بيرجّع فاضي لو مفيش رقم", () => {
    expect(deliveryOrderNumber({})).toBe("");
  });
});

// ==========================================================================
// تاريخ بوسطة — الباج اللي سجل المزامنة كشفه
// ==========================================================================
describe("تحويل تاريخ بوسطة", () => {
  it("بيحوّل الشكل اللي بوسطة بترجّعه فعلًا", () => {
    // ده النص الحقيقي اللي بوستجرس رفضه
    expect(isoDate("Wed Jul 29 2026 16:11:28 GMT+0000 (Coordinated Universal Time)"))
      .toBe("2026-07-29T16:11:28.000Z");
  });

  it("بيسيب ISO زي ما هو", () => {
    expect(isoDate("2026-07-29T16:11:28.000Z")).toBe("2026-07-29T16:11:28.000Z");
  });

  it("تاريخ مش مفهوم = null، مش قيمة غلط", () => {
    expect(isoDate("مش تاريخ")).toBeNull();
    expect(isoDate("")).toBeNull();
    expect(isoDate(null)).toBeNull();
    expect(isoDate(undefined)).toBeNull();
  });

  it("المزامنة بتكتب التاريخ بصيغة بوستجرس بيقبلها", () => {
    const d = decideSync(
      {
        ...deliveredShipment,
        createdAt: "Wed Jul 29 2026 16:11:28 GMT+0000 (Coordinated Universal Time)",
      },
      syncedOrder(),
      NOW
    );
    expect(d.changes.bosta_created_at).toBe("2026-07-29T16:11:28.000Z");
  });

  it("والتاريخ المحفوظ مابيتكتبش تاني — مفيش تغيير من غير سبب", () => {
    const d = decideSync(
      {
        ...deliveredShipment,
        createdAt: "Wed Jul 29 2026 16:11:28 GMT+0000 (Coordinated Universal Time)",
      },
      syncedOrder({ bosta_created_at: "2026-07-29T16:11:28.000Z" }),
      NOW
    );
    expect(d.changes).toEqual({});
  });
});

// ==========================================================================
// الخانقة اللي قلّبت أوردر ١٢٢٧ كل ١٥ دقيقة
// ==========================================================================
describe("الأوردر اللي عليه شحنة مرتجع", () => {
  it("الشحنة الأصلية مامتغيرش حالته", () => {
    // ١٢٢٧: الأصلية اتسلّمت، وعليه شحنة مرتجع عملها عمر. جزء المرتجع كان
    // بيحطه "في الطريق ليك" وجزء التوصيل يرجّعه "تم التسليم" — كل ١٥ دقيقة
    // واحد يلغي التاني، وطلّع ٤٣ سطر سجل و٣٩ إشعار.
    const d = decideSync(
      deliveredShipment,
      syncedOrder({ order_status: "returning", hasCustomerReturn: true }),
      NOW
    );
    expect(d.statusLocked).toBe(true);
    expect(d.changes.order_status).toBeUndefined();
  });

  it("بس الرسوم والتحصيل بيتحدّثوا عادي", () => {
    const d = decideSync(
      { ...deliveredShipment, cod: 4000 },
      syncedOrder({ order_status: "returning", hasCustomerReturn: true }),
      NOW
    );
    expect(d.changes.bosta_cod).toBe(4000);
  });

  it("ومن غير شحنة مرتجع الحالة بتتحدّث زي الأول", () => {
    const d = decideSync(
      deliveredShipment,
      syncedOrder({ order_status: "shipped", hasCustomerReturn: false }),
      NOW
    );
    expect(d.changes.order_status).toBe("delivered");
  });
});

describe("مقارنة التواريخ بالوقت مش بالنص", () => {
  it("نفس اللحظة بشكلين مختلفين = متساويين", () => {
    // ده بالظبط اللي كان بيحصل: بوستجرس بيرجّع الشمال وإحنا بنكتب اليمين
    expect(sameInstant("2026-04-19T09:58:00+00:00", "2026-04-19T09:58:00.000Z")).toBe(true);
  });

  it("لحظتين مختلفين = مش متساويين", () => {
    expect(sameInstant("2026-04-19T09:58:00Z", "2026-04-19T09:59:00Z")).toBe(false);
  });

  it("الفاضي مع الفاضي متساويين، والفاضي مع قيمة لأ", () => {
    expect(sameInstant(null, null)).toBe(true);
    expect(sameInstant(null, "2026-04-19T09:58:00Z")).toBe(false);
  });

  it("تاريخ مش مفهوم = مش متساوي", () => {
    expect(sameInstant("مش تاريخ", "2026-04-19T09:58:00Z")).toBe(false);
  });

  it("والمزامنة مابتكتبش التاريخ تاني لو محفوظ بشكل بوستجرس", () => {
    const d = decideSync(
      {
        ...deliveredShipment,
        createdAt: "Wed Jul 29 2026 16:11:28 GMT+0000 (Coordinated Universal Time)",
      },
      // زي ما بوستجرس بيرجّعه بالظبط
      syncedOrder({ bosta_created_at: "2026-07-29T16:11:28+00:00" }),
      NOW
    );
    expect(d.changes).toEqual({});
  });
});
