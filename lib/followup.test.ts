import { describe, it, expect } from "vitest";
import {
  followupQueue,
  followupMessage,
  whatsappLink,
  ASK_AFTER_DAYS,
  ASK_BEFORE_DAYS,
  type FollowupOrder,
} from "./followup";

const NOW = new Date("2026-08-19T10:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

const order = (o: Partial<FollowupOrder>): FollowupOrder => ({
  id: "a",
  orderNumber: "1367",
  orderStatus: "delivered",
  deliveredAt: daysAgo(ASK_AFTER_DAYS),
  customerName: "مروة شهاب",
  customerPhone: "01001234567",
  ...o,
});

describe("طابور السؤال بعد التسليم", () => {
  it("المسلّم اللي في الوقت بيدخل", () => {
    const q = followupQueue([order({})], NOW);
    expect(q).toHaveLength(1);
    expect(q[0].orderNumber).toBe("1367");
  });

  it("قبل الميعاد مايدخلش — لسه مافتحش الكرتونة", () => {
    const q = followupQueue(
      [order({ deliveredAt: daysAgo(ASK_AFTER_DAYS - 1) })],
      NOW
    );
    expect(q).toEqual([]);
  });

  it("بعد الوقت المفيد مايدخلش", () => {
    const q = followupQueue(
      [order({ deliveredAt: daysAgo(ASK_BEFORE_DAYS + 1) })],
      NOW
    );
    expect(q).toEqual([]);
  });

  it("⚠️ الراجع مايتسألش «كل حاجة تمام؟»", () => {
    const q = followupQueue(
      [
        order({ orderStatus: "returned" }),
        order({ orderStatus: "returned_after_delivery" }),
        order({ orderStatus: "cancelled" }),
        order({ orderStatus: "shipped" }),
      ],
      NOW
    );
    expect(q).toEqual([]);
  });

  it("اللي اتسأل قبل كده مايتكررش", () => {
    const q = followupQueue([order({ followedUpAt: daysAgo(1) })], NOW);
    expect(q).toEqual([]);
  });

  it("⚠️ اللي مالوش تليفون بره القايمة — السطر يبقى لوم من غير فايدة", () => {
    const q = followupQueue(
      [order({ customerPhone: null }), order({ id: "b", customerPhone: "  " })],
      NOW
    );
    expect(q).toEqual([]);
  });

  it("الأقدم الأول", () => {
    const q = followupQueue(
      [
        order({ id: "a", deliveredAt: daysAgo(4) }),
        order({ id: "b", deliveredAt: daysAgo(8) }),
      ],
      NOW
    );
    expect(q.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("التاريخ الغلط أو الناقص مابيوقعش الحساب", () => {
    const q = followupQueue(
      [order({ deliveredAt: null }), order({ id: "b", deliveredAt: "مش تاريخ" })],
      NOW
    );
    expect(q).toEqual([]);
  });

  it("تاريخ في المستقبل مايدخلش", () => {
    const q = followupQueue([order({ deliveredAt: daysAgo(-3) })], NOW);
    expect(q).toEqual([]);
  });
});

describe("نص الرسالة", () => {
  it("بينادي بالاسم الأول ويذكر المنتج", () => {
    const m = followupMessage("مروة شهاب", ["مقبض ستارة"]);
    expect(m).toContain("أهلًا مروة");
    expect(m).toContain("مقبض ستارة");
  });

  it("⚠️ القالب بتاع صاحب المتجر هو اللي بيتبعت", () => {
    const m = followupMessage(
      "مروة شهاب",
      ["مقبض"],
      "مينيز",
      "معاك {المتجر} — أوردر {رقم الأوردر} وصل يا {الاسم}؟",
      "1367"
    );
    expect(m).toBe("معاك مينيز — أوردر 1367 وصل يا مروة؟");
  });

  it("أكتر من منتج بيتقال باختصار", () => {
    expect(followupMessage("عمر", ["مقبض", "شمعدان"])).toContain(
      "مقبض واللي معاه"
    );
  });

  it("من غير اسم ولا منتج بتفضل رسالة مفهومة ومفيش خانة فاضية بايظة", () => {
    const m = followupMessage(null, null);
    expect(m).toContain("أهلًا");
    expect(m).toContain("كل حاجة تمام؟");
    expect(m).not.toContain("undefined");
    expect(m).not.toContain("{");
  });
});

describe("رابط واتساب", () => {
  it("⚠️ الرقم المصري بياخد كود الدولة", () => {
    expect(whatsappLink("01001234567", "hi")).toContain("wa.me/201001234567");
  });

  it("الرقم اللي معاه كود مابيتكررش", () => {
    expect(whatsappLink("+20 100 123 4567", "hi")).toContain("wa.me/201001234567");
  });

  it("الرسالة بتتشفّر في اللينك", () => {
    const link = whatsappLink("01001234567", "كل حاجة تمام؟");
    expect(link).toContain("?text=");
    expect(link).not.toContain(" ");
  });
});
