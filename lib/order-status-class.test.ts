import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  orderStatusClass,
  orderStatusBadge,
  ORDER_STATUS_OPTIONS,
} from "./format";

const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

describe("شارة حالة الأوردر", () => {
  it("الحالة المعروفة بتاخد شكلها ونقطتها", () => {
    expect(orderStatusClass("delivered")).toBe("badge badge-dot badge-delivered");
    expect(orderStatusClass("out_for_delivery")).toBe(
      "badge badge-dot badge-out_for_delivery"
    );
  });

  it("الحروف الكبيرة والمسافات مابتفرقش", () => {
    expect(orderStatusClass(" Delivered ")).toBe("badge badge-dot badge-delivered");
  });

  it("⚠️ المجهول والفاضي بياخدوا الشكل المحايد — مش badge- + القيمة الغريبة", () => {
    for (const v of [null, undefined, "", "حاجة", "constructor", "toString"]) {
      expect(orderStatusClass(v), String(v)).toBe("badge badge-neutral");
    }
  });

  it("⚠️⚠️ كل حالة في السيستم ليها شكل في globals.css", () => {
    // من غير الحارس ده، حالة جديدة بتتضاف في lib/format.ts وشارتها بتطلع
    // نص عادي من غير لون — ومحدش بياخد باله لحد ما حد يسأل
    const missing = ORDER_STATUS_OPTIONS.map((o) => o.value).filter(
      (v) => !css.includes(`.badge-${v} {`)
    );
    expect(missing).toEqual([]);
    expect(css.includes(".badge-neutral {")).toBe(true);
    expect(css.includes(".badge-dot::before")).toBe(true);
  });

  it("١٢ حالة بالظبط", () => {
    expect(ORDER_STATUS_OPTIONS).toHaveLength(12);
  });

  it("الاسم العربي لسه شغّال", () => {
    expect(orderStatusBadge("delivered").label).toBe("تم التسليم");
    expect(orderStatusBadge(null).label).toBe("غير محدد");
    expect(orderStatusBadge("حاجة").label).toBe("حاجة");
    // ⚠️ اسم خاصية جوّه الكائن مايعدّيش كحالة
    expect(orderStatusBadge("constructor").label).toBe("constructor");
  });

  it("⚠️ مابقاش فيه ألوان Tailwind خام جوّه الحالات", () => {
    expect(Object.keys(orderStatusBadge("new"))).toEqual(["label"]);
  });
});
