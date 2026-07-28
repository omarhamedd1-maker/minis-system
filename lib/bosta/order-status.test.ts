import { describe, expect, it } from "vitest";
import {
  canSyncChangeStatus,
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
