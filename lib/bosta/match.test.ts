import { describe, expect, it } from "vitest";
import { buildIndex, matchDelivery, namesShare } from "./match";

const orders = [
  { id: "1", order_number: "1360", bosta_tracking: "8550116799", customerName: "محمد حسن" },
  { id: "2", order_number: "1371", bosta_tracking: null, customerName: "محمد السعودي" },
  { id: "3", order_number: "1122", bosta_tracking: null, customerName: "هبه زناتي" },
];
const index = buildIndex(orders);

describe("مطابقة الاسم", () => {
  it("بتعدّي لو فيه كلمة مشتركة", () => {
    expect(namesShare("محمد حسن", "محمد حسن ")).toBe(true);
    expect(namesShare("Ahmed Saleh", "ahmed  saleh")).toBe(true);
  });

  it("بتعدّي مع اختلاف الألف والياء والتاء المربوطة", () => {
    expect(namesShare("هبه زناتى", "هبة زناتي")).toBe(true);
    expect(namesShare("احمد", "أحمد")).toBe(true);
  });

  it("بتمنع لو الاسمين مختلفين تمامًا", () => {
    expect(namesShare("محمد حسن", "سعاد إبراهيم")).toBe(false);
  });

  it("بتعدّي لو أي اسم فاضي — منمنعش الربط عشان بيانات ناقصة", () => {
    expect(namesShare("", "أي حد")).toBe(true);
    expect(namesShare("محمد", "")).toBe(true);
  });
});

describe("ربط الشحنة بالأوردر", () => {
  it("رقم التتبع أقوى من رقم الأوردر", () => {
    const r = matchDelivery(
      {
        trackingNumber: "8550116799",
        shopifyInfo: { orderNumber: "1122" }, // رقم مختلف
        receiver: { fullName: "أي اسم" },
      },
      index
    );
    expect(r.kind).toBe("tracking");
    if (r.kind === "tracking") expect(r.order.id).toBe("1");
  });

  it("بيربط برقم الأوردر لو الاسم متوافق", () => {
    const r = matchDelivery(
      { shopifyInfo: { orderNumber: "#1371" }, receiver: { fullName: "محمد السعودي" } },
      index
    );
    expect(r.kind).toBe("order_number");
  });

  it("بيرفض لو رقم الأوردر مظبوط بس الاسم مختلف تمامًا", () => {
    // الحماية المهمة: رقم متكرر أو مرجع غلط مايحطش شحنة على أوردر غيره
    const r = matchDelivery(
      { shopifyInfo: { orderNumber: "1371" }, receiver: { fullName: "سعاد إبراهيم" } },
      index
    );
    expect(r.kind).toBe("name_mismatch");
  });

  it("بيرجّع مفيش لو الأوردر مش عندنا", () => {
    const r = matchDelivery(
      { shopifyInfo: { orderNumber: "9999" }, receiver: { fullName: "حد" } },
      index
    );
    expect(r.kind).toBe("none");
  });

  it("بيقرا رقم الأوردر من المرجع لو شوبيفاي مش موجود", () => {
    const r = matchDelivery(
      { businessReference: "minis: 1122", receiver: { fullName: "هبة زناتي" } },
      index
    );
    expect(r.kind).toBe("order_number");
  });
});
