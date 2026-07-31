import { describe, expect, it } from "vitest";
import { MIN_PASSWORD, checkNewTenant } from "./create-tenant";

const good = {
  businessName: "متجر التجربة",
  ownerName: "عمر",
  email: "omar@example.com",
  password: "12345678",
};

describe("فحص بيانات التسجيل", () => {
  it("البيانات الصح بتعدّي", () => {
    expect(checkNewTenant(good)).toBeNull();
  });

  it("اسم البيزنس مطلوب", () => {
    expect(checkNewTenant({ ...good, businessName: "   " })).toBe("اكتب اسم البيزنس");
  });

  it("اسم صاحب البيزنس مطلوب", () => {
    expect(checkNewTenant({ ...good, ownerName: "" })).toBe("اكتب اسمك");
  });

  it("الإيميل لازم يبقى شكله إيميل", () => {
    expect(checkNewTenant({ ...good, email: "omar" })).toBe("الإيميل مش مظبوط");
    expect(checkNewTenant({ ...good, email: "omar@x" })).toBe("الإيميل مش مظبوط");
    expect(checkNewTenant({ ...good, email: "omar @x.com" })).toBe("الإيميل مش مظبوط");
  });

  it("الباسورد القصير بيترفض", () => {
    const msg = checkNewTenant({ ...good, password: "1234567" });
    expect(msg).toContain(String(MIN_PASSWORD));
  });

  it("التأكيد لازم يطابق لو اتبعت", () => {
    expect(
      checkNewTenant({ ...good, confirm: "غير كده" })
    ).toBe("الباسوردين مش زي بعض");
    expect(checkNewTenant({ ...good, confirm: good.password })).toBeNull();
  });

  it("**التأكيد اختياري** — شاشة البيزنسات مابتطلبهوش", () => {
    expect(checkNewTenant(good)).toBeNull();
  });

  it("المسافات حوالين الإيميل مابتوقعش الفحص", () => {
    expect(checkNewTenant({ ...good, email: "  omar@example.com  " })).toBeNull();
  });
});
