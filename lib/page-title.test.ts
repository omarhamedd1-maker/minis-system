import { describe, expect, it } from "vitest";
import { pageTitle } from "./page-title";

describe("اسم الصفحة في الهيدر", () => {
  it("الرئيسية مالهاش اسم — التحية مكانها", () => {
    expect(pageTitle("/")).toBeNull();
    expect(pageTitle("")).toBeNull();
  });

  it("القسم بياخد اسمه", () => {
    expect(pageTitle("/orders")).toBe("الأوردرات");
    expect(pageTitle("/cash")).toBe("الفلوس");
  });

  it("⚠️ الصفحة الداخلية اسمها اسم القسم — الرقم تحتها في العنوان", () => {
    expect(pageTitle("/orders/9f1c-abc")).toBe("الأوردرات");
    expect(pageTitle("/orders/reconcile")).toBe("الأوردرات");
  });

  it("الباراميترات مابتأثرش", () => {
    expect(pageTitle("/cash?tab=transfers")).toBe("الفلوس");
  });

  it("المسار اللي مش في القايمة بيرجع فاضي مش نص غلط", () => {
    expect(pageTitle("/حاجة-جديدة")).toBeNull();
  });
});
