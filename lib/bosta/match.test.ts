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

describe("المطابقة بالتليفون — لما المرجع ناقص", () => {
  const withPhones = [
    { id: "1", order_number: "1360", bosta_tracking: "8550116799", customerName: "محمد حسن", customerPhone: "01005361491" },
    { id: "2", order_number: "1371", bosta_tracking: null, customerName: "محمد السعودي", customerPhone: "01026791554" },
    { id: "3", order_number: "1122", bosta_tracking: null, customerName: "هبه زناتي", customerPhone: null },
  ];
  const idx = buildIndex(withPhones);

  it("تليفون يطابق أوردر واحد غير مربوط والاسم مؤكد = ربط", () => {
    const r = matchDelivery(
      { receiver: { fullName: "محمد السعودي", phone: "+201026791554" } },
      idx
    );
    expect(r.kind).toBe("phone");
    if (r.kind === "phone") expect(r.order.id).toBe("2");
  });

  it("صيغ التليفون المختلفة بتطلع لنفس المفتاح (+20 و0020 والمحلي)", () => {
    for (const p of ["+201026791554", "00201026791554", "01026791554"]) {
      const r = matchDelivery(
        { receiver: { fullName: "السعودي", phone: p } },
        idx
      );
      expect(r.kind).toBe("phone");
    }
  });

  it("الأوردر المربوط مابيبقاش مرشح — شحنة تانية لنفس العميل ماتلزقش فيه", () => {
    // الأوردر 1 مربوط (عنده تتبع) — فتليفونه مالوش مرشح غيره
    const r = matchDelivery(
      { receiver: { fullName: "محمد حسن", phone: "01005361491" } },
      idx
    );
    expect(r.kind).toBe("none");
  });

  it("اتنين على نفس التليفون؟ الاسم هو اللي بيفصل", () => {
    const two = [
      { id: "a", order_number: "10", bosta_tracking: null, customerName: "أحمد سامي", customerPhone: "01223334445" },
      { id: "b", order_number: "11", bosta_tracking: null, customerName: "أحمد فؤاد", customerPhone: "01223334445" },
    ];
    const r = matchDelivery(
      { receiver: { fullName: "سامي", phone: "01223334445" } },
      buildIndex(two)
    );
    expect(r.kind).toBe("phone");
    if (r.kind === "phone") expect(r.order.id).toBe("a");
  });

  it("اتنين على نفس التليفون والاسم بيطابق الاتنين = مافيش تخمين", () => {
    const two = [
      { id: "a", order_number: "10", bosta_tracking: null, customerName: "أحمد سامي", customerPhone: "01223334445" },
      { id: "b", order_number: "11", bosta_tracking: null, customerName: "سامي محمود", customerPhone: "01223334445" },
    ];
    const r = matchDelivery(
      { receiver: { fullName: "أحمد سامي", phone: "01223334445" } },
      buildIndex(two)
    );
    expect(r.kind).toBe("none");
  });

  it("تليفون مطابق بس الاسم مختلف تمامًا = مفيش — ده بيحرّك فلوس", () => {
    const r = matchDelivery(
      { receiver: { fullName: "سعاد إبراهيم", phone: "01026791554" } },
      idx
    );
    expect(r.kind).toBe("none");
  });
});
