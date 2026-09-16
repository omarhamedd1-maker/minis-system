import { describe, expect, it } from "vitest";
import { cashRowLabel, type CashLabelRow } from "./cash-label";

const row = (over: Partial<CashLabelRow>): CashLabelRow => ({
  direction: "in",
  source_type: "order",
  description: null,
  orders: null,
  expenses: null,
  ...over,
});

const order = (n: string, name: string | null) => ({
  order_number: n,
  customers: name === null ? null : { full_name: name },
});

describe("cashRowLabel", () => {
  it("التحصيل: اسم العميل ورقم الأوردر بس", () => {
    expect(cashRowLabel(row({ orders: order("1288", "أحمد الجندي") }))).toBe(
      "أحمد الجندي · 1288"
    );
  });

  it("المقدم بيتقال — بيفرق في مطابقة البنك", () => {
    expect(
      cashRowLabel(row({ source_type: "prepaid", orders: order("1274", "منى علي") }))
    ).toBe("مقدم: منى علي · 1274");
  });

  it("من غير اسم عميل يرجع لرقم الأوردر", () => {
    expect(cashRowLabel(row({ orders: order("1288", null) }))).toBe("أوردر 1288");
    expect(cashRowLabel(row({ orders: order("1288", "  ") }))).toBe("أوردر 1288");
  });

  it("⚠️ مفيش اسم نوع إنجليزي يظهر خام", () => {
    expect(cashRowLabel(row({ source_type: "opening" }))).toBe("رصيد افتتاحي");
    expect(cashRowLabel(row({ source_type: "something_new" }))).toBe("حركة");
    expect(cashRowLabel(row({ source_type: null }))).toBe("حركة");
  });

  it("نوع جديد من غير اسم بياخد الوصف لو موجود", () => {
    expect(
      cashRowLabel(row({ source_type: "something_new", description: "تسوية" }))
    ).toBe("تسوية");
  });

  it("اليدوي بيفضل بكلام عمر", () => {
    expect(
      cashRowLabel(row({ source_type: "manual", description: "تحصيل" }))
    ).toBe("إيداع يدوي: تحصيل");
    expect(cashRowLabel(row({ source_type: "manual", direction: "out" }))).toBe(
      "سحب يدوي"
    );
  });

  it("المصروف زي ما كان", () => {
    expect(
      cashRowLabel(
        row({
          source_type: "expense",
          direction: "out",
          expenses: { category: "تغليف", description: "كراتين" },
        })
      )
    ).toBe("مصروف: تغليف (كراتين)");
  });
});
