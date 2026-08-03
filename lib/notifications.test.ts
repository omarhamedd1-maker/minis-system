import { describe, expect, it } from "vitest";
import { changedWithin, noticeHref } from "./notifications";

describe("رابط الإشعار", () => {
  const fallback = "/orders?status=returned";

  it("أوردر واحد = يفتح الأوردر نفسه على طول", () => {
    // ده اللي كان مضايق عمر: إشعار بأوردر واحد بيفتح القايمة كلها
    expect(noticeHref(["abc"], fallback)).toBe("/orders/abc");
  });

  it("أكتر من واحد = القايمة متفلترة عليهم هم بس", () => {
    expect(noticeHref(["a", "b", "c"], fallback)).toBe("/orders?only=a,b,c");
  });

  it("عدد كبير جدًا = بيرجع للفلتر العادي عشان الرابط مايطولش", () => {
    const many = Array.from({ length: 41 }, (_, i) => `id${i}`);
    expect(noticeHref(many, fallback)).toBe(fallback);
  });

  it("مفيش أوردرات = الفلتر العادي", () => {
    expect(noticeHref([], fallback)).toBe(fallback);
  });
});

describe("مين اتغيّرت حالته من قريب", () => {
  const now = new Date("2026-08-04T12:00:00Z");

  it("اللي اتغيّر من ساعتين داخل، واللي من أسبوع لأ", () => {
    const ids = changedWithin(
      [
        { order_id: "a", created_at: "2026-08-04T10:00:00Z" },
        { order_id: "b", created_at: "2026-07-28T10:00:00Z" },
      ],
      24,
      now
    );
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(false);
  });

  it("على الحد بالظبط بيتحسب داخل", () => {
    const ids = changedWithin(
      [{ order_id: "a", created_at: "2026-08-03T12:00:00Z" }],
      24,
      now
    );
    expect(ids.has("a")).toBe(true);
  });

  it("السطر الناقص أو التاريخ الغلط بيتعدّى من غير ما يقع", () => {
    const ids = changedWithin(
      [
        { order_id: null, created_at: "2026-08-04T10:00:00Z" },
        { order_id: "b", created_at: null },
        { order_id: "c", created_at: "مش تاريخ" },
      ],
      24,
      now
    );
    expect(ids.size).toBe(0);
  });

  it("نفس الأوردر مرتين = مرة واحدة", () => {
    const ids = changedWithin(
      [
        { order_id: "a", created_at: "2026-08-04T10:00:00Z" },
        { order_id: "a", created_at: "2026-08-04T11:00:00Z" },
      ],
      24,
      now
    );
    expect(ids.size).toBe(1);
  });
});
