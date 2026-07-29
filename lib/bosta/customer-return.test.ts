import { describe, expect, it } from "vitest";
import {
  isCustomerReturn,
  matchCustomerReturn,
  phoneKey,
  returnArrived,
  type ReturnCandidate,
  type ReturnDelivery,
} from "./customer-return";

const order = (over: Partial<ReturnCandidate> = {}): ReturnCandidate => ({
  id: "o1",
  order_number: "1300",
  order_status: "delivered",
  customerPhone: "01026791554",
  customerName: "سلوى مصطفى",
  return_tracking: null,
  ...over,
});

const ret = (over: Partial<ReturnDelivery> = {}): ReturnDelivery => ({
  trackingNumber: "1715263323",
  type: { code: 25 },
  state: { value: "Created", code: 10 },
  receiver: { phone: "+201026791554", fullName: "سلوي مصطفي مصطفي" },
  ...over,
});

describe("مفتاح التليفون", () => {
  it("بيوحّد الأشكال المختلفة", () => {
    // بوسطة بتكتبه بأشكال، وإحنا بنخزّنه بشكل تاني
    expect(phoneKey("+201026791554")).toBe(phoneKey("01026791554"));
    expect(phoneKey("0020 102 679 1554")).toBe(phoneKey("01026791554"));
  });

  it("بيرفض الناقص", () => {
    expect(phoneKey("0100")).toBe("");
    expect(phoneKey(null)).toBe("");
  });
});

describe("نوع الشحنة", () => {
  it("٢٥ = مرتجع من العميل", () => {
    expect(isCustomerReturn(ret())).toBe(true);
  });

  it("٢٠ (رجعت من غير تسليم) مش مرتجع بعد تسليم", () => {
    expect(isCustomerReturn(ret({ type: { code: 20 } }))).toBe(false);
  });

  it("١٠ (توصيل عادي) لأ", () => {
    expect(isCustomerReturn(ret({ type: { code: 10 } }))).toBe(false);
  });
});

describe("وصلت ولا لسه", () => {
  it("٤٥ و٤٦ = وصلت لنا", () => {
    expect(returnArrived(ret({ state: { value: "Delivered", code: 45 } }))).toBe(true);
    expect(returnArrived(ret({ state: { value: "Delivered", code: 46 } }))).toBe(true);
  });

  it("لسه في السكة", () => {
    expect(returnArrived(ret())).toBe(false);
    expect(returnArrived(ret({ state: { value: "Out for delivery", code: 30 } }))).toBe(false);
  });
});

describe("ربط المرتجع بأوردره", () => {
  it("رقم التتبع المسجّل عندنا أقوى دليل", () => {
    const m = matchCustomerReturn(ret(), [
      order({ id: "x", order_status: "returning", return_tracking: "1715263323" }),
      order({ id: "y" }),
    ]);
    if (m.kind !== "matched") throw new Error("المفروض يربط");
    expect(m.order.id).toBe("x");
  });

  it("بيربط بالتليفون لو الشحنة اتعملت من بوسطة", () => {
    const m = matchCustomerReturn(ret(), [order({ id: "z" })]);
    if (m.kind !== "matched") throw new Error("المفروض يربط");
    expect(m.order.id).toBe("z");
  });

  it("بيقول وصلت لو الشحنة خلصت", () => {
    const m = matchCustomerReturn(
      ret({ state: { value: "Delivered", code: 45 } }),
      [order()]
    );
    if (m.kind !== "matched") throw new Error("المفروض يربط");
    expect(m.arrived).toBe(true);
  });

  it("أوردر مااتسلّمش أصلاً مايتربطش — المرتجع بعد التسليم مالوش معنى", () => {
    expect(matchCustomerReturn(ret(), [order({ order_status: "shipped" })]).kind).toBe("none");
    expect(matchCustomerReturn(ret(), [order({ order_status: "cancelled" })]).kind).toBe("none");
  });

  it("تليفون تاني خالص = مفيش", () => {
    expect(
      matchCustomerReturn(ret(), [order({ customerPhone: "01111111111" })]).kind
    ).toBe("none");
  });

  it("أكتر من أوردر لنفس التليفون: الاسم بيفصل", () => {
    const m = matchCustomerReturn(ret(), [
      order({ id: "a", order_number: "1200", customerName: "محمد على" }),
      order({ id: "b", order_number: "1300", customerName: "سلوى مصطفى" }),
    ]);
    if (m.kind !== "matched") throw new Error("المفروض يفصل بالاسم");
    expect(m.order.id).toBe("b");
  });

  it("الاسم مافصلش = محتاجة مراجعة، ومانخمّنش", () => {
    // نفس التليفون ونفس الاسم على أوردرين متسلّمين — مانعرفش أنهي واحد
    const m = matchCustomerReturn(ret(), [
      order({ id: "a", order_number: "1200" }),
      order({ id: "b", order_number: "1300" }),
    ]);
    expect(m.kind).toBe("ambiguous");
    if (m.kind === "ambiguous") expect(m.orders).toHaveLength(2);
  });

  it("شحنة من غير تليفون = مفيش", () => {
    expect(
      matchCustomerReturn(ret({ receiver: { phone: null } }), [order()]).kind
    ).toBe("none");
  });
});
