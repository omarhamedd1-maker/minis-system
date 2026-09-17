import { describe, expect, it } from "vitest";
import { clampReturned, parseCondition, shelfDelta } from "./returned-items";

describe("المخزون مع المرتجع", () => {
  it("قطعتين رجعوا سليمين = +٢", () => {
    expect(shelfDelta({ quantity: 0, condition: "restocked" }, { quantity: 2, condition: "restocked" })).toBe(2);
  });

  it("⚠️ التالف مابيدخلش المخزون", () => {
    expect(shelfDelta({ quantity: 0, condition: "restocked" }, { quantity: 2, condition: "damaged" })).toBe(0);
  });

  it("اتضح إنها تالفة بعد ما اتسجّلت سليمة = بتتشال", () => {
    expect(shelfDelta({ quantity: 2, condition: "restocked" }, { quantity: 2, condition: "damaged" })).toBe(-2);
  });

  it("تعديل الكمية بيحرّك الفرق بس", () => {
    expect(shelfDelta({ quantity: 1, condition: "restocked" }, { quantity: 3, condition: "restocked" })).toBe(2);
    expect(shelfDelta({ quantity: 3, condition: "restocked" }, { quantity: 1, condition: "restocked" })).toBe(-2);
  });

  it("من غير تغيير = صفر", () => {
    expect(shelfDelta({ quantity: 2, condition: "damaged" }, { quantity: 2, condition: "damaged" })).toBe(0);
  });
});

describe("الإدخال", () => {
  it("الحالة الافتراضية رجعت للمخزون", () => {
    expect(parseCondition(null)).toBe("restocked");
    expect(parseCondition("كلام")).toBe("restocked");
    expect(parseCondition("damaged")).toBe("damaged");
  });

  it("الكمية بين صفر والمطلوب", () => {
    expect(clampReturned("2", 3)).toBe(2);
    expect(clampReturned("9", 3)).toBe(3);
    expect(clampReturned("-1", 3)).toBe(0);
    expect(clampReturned("1.5", 3)).toBe(0);
    expect(clampReturned("", 3)).toBe(0);
    expect(clampReturned(null, 3)).toBe(0);
  });
});
