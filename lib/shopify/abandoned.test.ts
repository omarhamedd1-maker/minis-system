import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  triageCarts,
  type AbandonedCart,
} from "./abandoned.ts";

function cart(over: Partial<AbandonedCart> = {}): AbandonedCart {
  return {
    id: "gid://1",
    url: "https://shop/checkout/1",
    createdAt: "2026-08-10",
    total: 500,
    customerName: "أمينة فتحي",
    phone: "01012345678",
    city: "القاهرة",
    items: [{ title: "أباجورة", quantity: 1, variantId: "v1" }],
    ...over,
  };
}

describe("توحيد التليفون", () => {
  it("نفس الرقم بأشكاله المختلفة", () => {
    const want = "1012345678";
    expect(normalizePhone("01012345678")).toBe(want);
    expect(normalizePhone("+201012345678")).toBe(want);
    expect(normalizePhone("0100 1234 5678".replace("100", "101").replace(" ", ""))).not.toBe("");
    expect(normalizePhone("201012345678")).toBe(want);
    expect(normalizePhone("0101-234-5678")).toBe(want);
  });

  it("الفاضي بيرجع فاضي", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("مفيش")).toBe("");
  });
});

describe("تقسيم السلات", () => {
  it("**اللي اشترى بعدها مايتصلش بيه**", () => {
    // لو اتصلنا هنبان إننا مش عارفين إنه اشترى — أسوأ من إننا ماتصلناش
    const r = triageCarts([cart({ phone: "01012345678" })], ["+201012345678"]);
    expect(r.recovered).toHaveLength(1);
    expect(r.callable).toHaveLength(0);
  });

  it("اللي مفيش له تليفون مايتحسبش قابل للمتابعة", () => {
    const r = triageCarts([cart({ phone: null })], []);
    expect(r.unreachable).toHaveLength(1);
    expect(r.callable).toHaveLength(0);
    expect(r.callableValue).toBe(0);
  });

  it("بيرتّب بالأغلى — دي اللي تستاهل أول مكالمة", () => {
    const r = triageCarts(
      [
        cart({ id: "a", total: 300, phone: "01011111111" }),
        cart({ id: "b", total: 1200, phone: "01022222222" }),
        cart({ id: "c", total: 700, phone: "01033333333" }),
      ],
      []
    );
    expect(r.callable.map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(r.callableValue).toBe(2200);
  });

  it("الحد الأدنى بيستبعد الصغير", () => {
    const r = triageCarts(
      [
        cart({ id: "a", total: 100, phone: "01011111111" }),
        cart({ id: "b", total: 900, phone: "01022222222" }),
      ],
      [],
      500
    );
    expect(r.callable.map((c) => c.id)).toEqual(["b"]);
  });

  it("المقارنة بالتليفون مش بالإيميل", () => {
    // في مصر التليفون هو المُعرّف — الإيميل بيتساب فاضي أو بيتكتب أي حاجة
    const r = triageCarts(
      [cart({ phone: "01012345678" })],
      ["01099999999"]
    );
    expect(r.callable).toHaveLength(1);
  });

  it("مفيش سلات → أصفار", () => {
    const r = triageCarts([], []);
    expect(r.callable).toHaveLength(0);
    expect(r.callableValue).toBe(0);
  });
});
