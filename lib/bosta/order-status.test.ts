import { describe, expect, it } from "vitest";
import {
  canSyncChangeStatus,
  mapBostaDelivery,
  mapBostaState,
} from "./order-status";

// الحالات دي كلها اتشافت فعلاً في بيانات بوسطة الحقيقية بتاعة مينيس

describe("ترجمة حالات بوسطة", () => {
  it("Delivered ← تم التسليم", () => {
    expect(mapBostaState("Delivered")).toBe("delivered");
  });

  it("Out For Delivery ← في الطريق للعميل، مش تم التسليم", () => {
    // دي الغلطة اللي حصلت قبل كده: الكلمة فيها deliver
    expect(mapBostaState("Out For Delivery")).toBe("out_for_delivery");
    expect(mapBostaState("out for delivery")).toBe("out_for_delivery");
  });

  it("Picked Up و Processing و In Transit ← مع المندوب", () => {
    expect(mapBostaState("Picked Up")).toBe("shipped");
    expect(mapBostaState("Processing")).toBe("shipped");
    expect(mapBostaState("In Transit")).toBe("shipped");
    expect(mapBostaState("Received at warehouse")).toBe("shipped");
  });

  it("Created و Waiting for pickup ← جاهز للشحن", () => {
    expect(mapBostaState("Created")).toBe("ready");
    expect(mapBostaState("Waiting for pickup")).toBe("ready");
    expect(mapBostaState("Pickup requested")).toBe("ready");
  });

  it("Returned to origin ← رجعت ومتسلمتش", () => {
    expect(mapBostaState("Returned to origin")).toBe("returned");
    expect(mapBostaState("Returned to business")).toBe("returned");
    expect(mapBostaState("Exchanged & Returned")).toBe("returned");
  });

  it("Return in progress ← في الطريق ليك", () => {
    expect(mapBostaState("Return in progress")).toBe("returning");
  });

  it("Awaiting action ← محتاج تصرّف", () => {
    expect(mapBostaState("Awaiting Action")).toBe("awaiting_action");
    expect(mapBostaState("Exception")).toBe("awaiting_action");
    expect(mapBostaState("On Hold")).toBe("awaiting_action");
  });

  it("Cancelled ← ملغي", () => {
    expect(mapBostaState("Cancelled")).toBe("cancelled");
    expect(mapBostaState("Terminated")).toBe(null); // مش معروفة، مانلمسش الحالة
  });

  it("حالة فاضية أو مش معروفة مابتغيرش حاجة", () => {
    expect(mapBostaState(null)).toBe(null);
    expect(mapBostaState("")).toBe(null);
    expect(mapBostaState("حاجة جديدة من بوسطة")).toBe(null);
  });
});

describe("الحالات المقفولة", () => {
  it("المزامنة مامتلمسش الملغي ولا المرتجع بعد التسليم", () => {
    expect(canSyncChangeStatus("cancelled")).toBe(false);
    expect(canSyncChangeStatus("returned_after_delivery")).toBe(false);
  });

  it("باقي الحالات المزامنة بتغيّرها عادي", () => {
    expect(canSyncChangeStatus("delivered")).toBe(true);
    expect(canSyncChangeStatus("shipped")).toBe(true);
    expect(canSyncChangeStatus(null)).toBe(true);
  });
});

// ==========================================================================
// الأكواد — الدرس اللي كلّفنا ٤٣ أوردر محسوبين غلط
// ==========================================================================
describe("الحالة بالكود مش بالنص", () => {
  it("كود ٤٦ = رجعت لنا، حتى لو النص قايل Delivered", () => {
    // دي بالظبط الحالة اللي خلت ٧٩ شحنة راجعة تتحسب متسلّمة
    expect(mapBostaDelivery({ value: "Delivered", code: 46 })).toBe("returned");
  });

  it("كود ٤٥ = اتسلّمت فعلاً", () => {
    expect(mapBostaDelivery({ value: "Delivered", code: 45 })).toBe("delivered");
  });

  it("الأكواد اللي شفناها في الداتا الحقيقية", () => {
    expect(mapBostaDelivery({ value: "Created", code: 10 })).toBe("ready");
    expect(mapBostaDelivery({ value: "Processing", code: 24 })).toBe("shipped");
    expect(mapBostaDelivery({ value: "Processing", code: 30 })).toBe("shipped");
    expect(mapBostaDelivery({ value: "Terminated", code: 48 })).toBe("awaiting_action");
    expect(mapBostaDelivery({ value: "", code: 104 })).toBe("awaiting_action");
  });

  it("كود مش معروف + Delivered = مانغيّرش حاجة", () => {
    // ممكن تكون راجعة زي ٤٦ — مانخاطرش بفلوس على تخمين
    expect(mapBostaDelivery({ value: "Delivered", code: 999 })).toBeNull();
  });

  it("كود مش معروف + نص واضح = بنمشي بالنص", () => {
    expect(mapBostaDelivery({ value: "Out for delivery", code: 999 })).toBe("out_for_delivery");
    expect(mapBostaDelivery({ value: "Cancelled", code: 999 })).toBe("cancelled");
  });

  it("مفيش حالة خالص = مانغيّرش", () => {
    expect(mapBostaDelivery(null)).toBeNull();
    expect(mapBostaDelivery({})).toBeNull();
  });
});
