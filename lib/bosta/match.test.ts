import { describe, expect, it } from "vitest";
import { buildIndex, matchDelivery, namesShare, shipmentTooOld, type MatchTarget } from "./match";

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

// ==========================================================================
// الشحنة القديمة ما تنطّش على أوردر جديد (٣٠ أكتوبر ٢٠٢٦)
// --------------------------------------------------------------------------
// الحالتين دول حصلوا فعلًا في ٢ سِك — الأرقام والتواريخ زي ما هي.
// ==========================================================================
describe("الشحنة أقدم من الأوردر", () => {
  const order = (over: Partial<MatchTarget> = {}): MatchTarget => ({
    id: "o1",
    order_number: "1582",
    bosta_tracking: null,
    customerName: "محمد اشرف",
    customerPhone: "01008580016",
    orderDate: "2026-10-30T15:27:01Z",
    ...over,
  });

  it("أوردر ١٥٨٢: شحنة ٢٥ فبراير ما تتربطش بأوردر ٣٠ أكتوبر", () => {
    const r = matchDelivery(
      {
        trackingNumber: "82930382",
        createdAt: "2026-02-25T22:03:06Z",
        receiver: { fullName: "محمد اشرف", phone: "01008580016" },
      },
      buildIndex([order()])
    );
    expect(r.kind).toBe("none");
  });

  it("أوردر ١٥٧٧: شحنة ١١ فبراير ما تتربطش بأوردر ٢٩ أكتوبر", () => {
    const r = matchDelivery(
      {
        trackingNumber: "44638627",
        createdAt: "2026-02-11T00:54:24Z",
        receiver: { fullName: "كارما Ramy", phone: "01113458260" },
      },
      buildIndex([
        order({
          id: "o2",
          order_number: "1577",
          customerName: "كارما Ramy",
          customerPhone: "01113458260",
          orderDate: "2026-10-29T15:22:37Z",
        }),
      ])
    );
    expect(r.kind).toBe("none");
  });

  it("الشحنة بعد الأوردر بأيام = ربط عادي", () => {
    const r = matchDelivery(
      {
        createdAt: "2026-11-01T10:00:00Z",
        receiver: { fullName: "محمد اشرف", phone: "01008580016" },
      },
      buildIndex([order()])
    );
    expect(r.kind).toBe("phone");
  });

  it("فرق ١٣ يوم لسه مقبول — ده أقصى فرق سليم في البيانات", () => {
    const r = matchDelivery(
      {
        createdAt: "2026-10-17T15:27:01Z",
        receiver: { fullName: "محمد اشرف", phone: "01008580016" },
      },
      buildIndex([order()])
    );
    expect(r.kind).toBe("phone");
  });

  it("مفيش تاريخ أوردر؟ ما نقفلش الربط — الأوردرات المستوردة مالهاش", () => {
    const r = matchDelivery(
      {
        createdAt: "2026-02-25T22:03:06Z",
        receiver: { fullName: "محمد اشرف", phone: "01008580016" },
      },
      buildIndex([order({ orderDate: null })])
    );
    expect(r.kind).toBe("phone");
  });

  it("رقم التتبع المربوط أقوى من التاريخ", () => {
    const r = matchDelivery(
      {
        trackingNumber: "82930382",
        createdAt: "2026-02-25T22:03:06Z",
        receiver: { fullName: "محمد اشرف", phone: "01008580016" },
      },
      buildIndex([order({ bosta_tracking: "82930382" })])
    );
    expect(r.kind).toBe("tracking");
  });

  it("المرجع برقم الأوردر أقوى من التاريخ", () => {
    const r = matchDelivery(
      {
        businessReference: "1582",
        createdAt: "2026-02-25T22:03:06Z",
        receiver: { fullName: "محمد اشرف", phone: "01008580016" },
      },
      buildIndex([order()])
    );
    expect(r.kind).toBe("order_number");
  });
});

describe("shipmentTooOld", () => {
  it("تاريخ ناقص = مابنقفلش", () => {
    expect(shipmentTooOld(null, "2026-10-30")).toBe(false);
    expect(shipmentTooOld("2026-02-25", null)).toBe(false);
  });
  it("تاريخ مش مفهوم = مابنقفلش", () => {
    expect(shipmentTooOld("مش تاريخ", "2026-10-30")).toBe(false);
  });
  it("الشحنة بعد الأوردر = عادي مهما كان الفرق", () => {
    expect(shipmentTooOld("2027-01-01", "2026-10-30")).toBe(false);
  });
});
