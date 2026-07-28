import { describe, expect, it } from "vitest";
import { decideSync, deliveryOrderNumber, type OurOrder } from "./reconcile";

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
    productValue: 3600,
    ...over,
  };
}

const deliveredShipment = {
  trackingNumber: "8550116799",
  state: { value: "Delivered" },
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

  it("مابتتحسبش للشحنة اللي لسه متعملة ومستنية المندوب", () => {
    const d = decideSync(
      { ...deliveredShipment, state: { value: "Created" } },
      syncedOrder({ order_status: "ready", bosta_shipping_cost: null }),
      NOW
    );
    expect(d.changes.bosta_shipping_cost).toBeUndefined();
  });

  it("المرتجع رسومه أقل — مفيش تحصيل ولا تحويل", () => {
    const d = decideSync(
      { ...deliveredShipment, state: { value: "Returned to origin" } },
      syncedOrder({ order_status: "shipped", bosta_shipping_cost: null }),
      NOW
    );
    expect(d.changes.bosta_shipping_cost).toBe(30.78);
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
