import { describe, expect, it } from "vitest";
import {
  RETURN_REASONS,
  breakdownReturnReasons,
  isReturnReason,
  returnReasonLabel,
  type ReturnedOrder,
} from "./return-reasons.ts";

function ret(over: Partial<ReturnedOrder> = {}): ReturnedOrder {
  return {
    order_status: "returned",
    return_reason: "no_answer",
    discount: 0,
    shipping_price: 0,
    order_items: [{ quantity: 1, sale_price_at_order: 500 }],
    ...over,
  };
}

describe("القايمة نفسها", () => {
  it("مفيش قيمة مكررة", () => {
    const values = RETURN_REASONS.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("كل سبب معاه علاج — السبب من غير علاج مالوش لازمة", () => {
    for (const r of RETURN_REASONS) {
      expect(r.fix.trim().length).toBeGreaterThan(10);
    }
  });

  it("الاسم بيرجع، والفاضي بيقول مااتسجّلش", () => {
    expect(returnReasonLabel("no_answer")).toBe("العميل مش بيرد");
    expect(returnReasonLabel(null)).toBe("مااتسجّلش");
  });

  it("**القيمة اللي مش في القايمة مش سبب**", () => {
    // لو الخانة نص حر كل واحد هيكتب بطريقته والإحصائية تبوظ
    expect(isReturnReason("مردش")).toBe(false);
    expect(isReturnReason("no_answer")).toBe(true);
  });
});

describe("توزيع الأسباب", () => {
  it("بيعد ويرتّب بالأكتر", () => {
    const r = breakdownReturnReasons([
      ret({ return_reason: "no_answer" }),
      ret({ return_reason: "no_answer" }),
      ret({ return_reason: "no_answer" }),
      ret({ return_reason: "unclear_address" }),
    ]);
    expect(r.rows[0].value).toBe("no_answer");
    expect(r.rows[0].count).toBe(3);
    expect(r.rows[0].share).toBe(75);
    expect(r.rows[1].value).toBe("unclear_address");
  });

  it("**اللي مااتسجّلش سببه بيتعرض لوحده ومابيدخلش النسب**", () => {
    const r = breakdownReturnReasons([
      ret({ return_reason: "no_answer" }),
      ret({ return_reason: null }),
      ret({ return_reason: null }),
    ]);
    expect(r.total).toBe(3);
    expect(r.unknown).toBe(2);
    // النسبة على اللي اتسجّل بس — واحد من واحد
    expect(r.rows[0].share).toBe(100);
  });

  it("القيمة الغريبة بتتحسب مجهولة مش سبب جديد", () => {
    const r = breakdownReturnReasons([ret({ return_reason: "حاجة تانية خالص" })]);
    expect(r.unknown).toBe(1);
    expect(r.rows).toHaveLength(0);
  });

  it("بيجمع قيمة البضاعة الراجعة لكل سبب", () => {
    const r = breakdownReturnReasons([
      ret({
        return_reason: "damaged",
        order_items: [{ quantity: 2, sale_price_at_order: 400 }],
        discount: 100,
        shipping_price: 90,
      }),
    ]);
    expect(r.rows[0].amount).toBe(2 * 400 - 100 + 90);
  });

  it("المرتجع بعد التسليم بيتحسب برضه", () => {
    const r = breakdownReturnReasons([
      ret({ order_status: "returned_after_delivery", return_reason: "damaged" }),
    ]);
    expect(r.total).toBe(1);
    expect(r.rows[0].value).toBe("damaged");
  });

  it("اللي مارجعش مايدخلش خالص", () => {
    const r = breakdownReturnReasons([
      ret({ order_status: "delivered", return_reason: "no_answer" }),
      ret({ order_status: "new", return_reason: null }),
    ]);
    expect(r.total).toBe(0);
    expect(r.unknown).toBe(0);
  });

  it("مفيش رجوع → فاضي من غير قسمة على صفر", () => {
    const r = breakdownReturnReasons([]);
    expect(r.total).toBe(0);
    expect(r.rows).toHaveLength(0);
    expect(r.unknown).toBe(0);
  });
});
