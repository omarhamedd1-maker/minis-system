import { describe, it, expect } from "vitest";
import {
  checkLinkOrder,
  normalizePhone,
  linkOrderNumber,
  MAX_QUANTITY,
  MIN_ADDRESS,
} from "./order-link";

const good = {
  fullName: "مروة شهاب",
  phone: "01001234567",
  address: "٢٧ شارع مصدق، الدقي، عمارة 12 الدور 3",
  quantity: 1,
};

const ok = (o: Partial<typeof good> = {}) => checkLinkOrder({ ...good, ...o });

describe("فحص أوردر اللينك", () => {
  it("البيانات الكاملة بتعدّي", () => {
    const r = ok();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.phone).toBe("01001234567");
      expect(r.quantity).toBe(1);
    }
  });

  it("الاسم الناقص بيترفض برسالة واضحة", () => {
    const r = ok({ fullName: "م" });
    expect(r).toEqual({ ok: false, error: "اكتب اسمك" });
  });

  it("المسافات الزيادة في الاسم بتتشال", () => {
    const r = ok({ fullName: "  مروة   شهاب  " });
    if (r.ok) expect(r.fullName).toBe("مروة شهاب");
  });

  it("⚠️ التليفون بأشكاله كلها بيطلع شكل واحد", () => {
    for (const p of ["01001234567", "+201001234567", "0020 100 123 4567", "٠١٠٠١٢٣٤٥٦٧"]) {
      expect(normalizePhone(p), p).toBe("01001234567");
    }
  });

  it("التليفون الناقص بيترفض", () => {
    expect(ok({ phone: "0100123" }).ok).toBe(false);
    expect(ok({ phone: "" }).ok).toBe(false);
  });

  it("⚠️ العنوان القصير بيترفض — المندوب مش هيلاقيه", () => {
    const r = ok({ address: "المعادي" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("بالتفصيل");
  });

  it("العنوان على الحد بالظبط بيعدّي", () => {
    expect(ok({ address: "ا".repeat(MIN_ADDRESS) }).ok).toBe(true);
  });

  it("الكمية الغلط بترجع واحد", () => {
    for (const q of [0, -3, 1.5, "حاجة", null]) {
      const r = checkLinkOrder({ ...good, quantity: q as never });
      if (r.ok) expect(r.quantity, String(q)).toBe(1);
    }
  });

  it("⚠️ الكمية الكبيرة بتترفض — مش أوردر عميل", () => {
    expect(checkLinkOrder({ ...good, quantity: MAX_QUANTITY }).ok).toBe(true);
    expect(checkLinkOrder({ ...good, quantity: MAX_QUANTITY + 1 }).ok).toBe(false);
  });

  it("الفاضي تمامًا مابيوقعش", () => {
    expect(checkLinkOrder({}).ok).toBe(false);
  });
});

describe("رقم الأوردر", () => {
  it("⚠️ بيبدأ بحرف مختلف عن اليدوي عشان تعرفه من الرقم", () => {
    const n = linkOrderNumber(new Date("2026-08-19T10:00:00Z"));
    expect(n.startsWith("L-")).toBe(true);
    expect(n).not.toContain("M-");
  });
});
