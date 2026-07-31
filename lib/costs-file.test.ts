import { describe, expect, it } from "vitest";
import {
  buildCostFile,
  parseCostFile,
  parseNumber,
  type KnownVariant,
} from "./costs-file";

const row = (
  variantId: string,
  productName: string,
  salePrice: number,
  costPrice = 0,
  variantName: string | null = null,
  sku: string | null = "1001"
) => ({ variantId, sku, productName, variantName, salePrice, costPrice });

describe("بناء الملف", () => {
  it("بيبدأ بـBOM — من غيره إكسيل بيقرا العربي رموز", () => {
    const out = buildCostFile([]);
    expect(out.startsWith("﻿")).toBe(true);
  });

  it("العناوين بالعربي والفاصل فاصلة منقوطة", () => {
    const out = buildCostFile([]);
    expect(out).toContain("المعرف;الكود;المنتج;الشكل;سعر البيع;التكلفة");
  });

  it("التكلفة صفر بتتساب فاضية عشان تبان إنها مستنية", () => {
    const out = buildCostFile([row("v1", "كرسي", 1200, 0)]);
    expect(out).toContain("v1;1001;كرسي;;1200;\r\n");
  });

  it("التكلفة الموجودة بتتكتب زي ما هي", () => {
    const out = buildCostFile([row("v1", "كرسي", 1200, 700)]);
    expect(out).toContain("v1;1001;كرسي;;1200;700");
  });

  it("الاسم اللي فيه فاصلة منقوطة بيتحط بين علامتين", () => {
    const out = buildCostFile([row("v1", "كرسي; مودرن", 1200)]);
    expect(out).toContain('"كرسي; مودرن"');
  });
});

describe("قراءة الأرقام", () => {
  it("بيقبل الأرقام العربية", () => {
    expect(parseNumber("١٢٠٠")).toBe(1200);
  });

  it("بيشيل فاصلة الآلاف", () => {
    expect(parseNumber("1,200")).toBe(1200);
  });

  it("بيقبل الفاصلة العشرية العربية", () => {
    expect(parseNumber("12٫5")).toBe(12.5);
  });

  it("بيشيل كلمة جنيه لو حد كتبها", () => {
    expect(parseNumber("700 جنيه")).toBe(700);
  });

  it("الكلام مش رقم", () => {
    expect(parseNumber("مش عارف")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});

describe("قراءة الملف المرفوع", () => {
  const known = new Map<string, KnownVariant>([
    ["v1", { name: "كرسي", costPrice: 0 }],
    ["v2", { name: "ترابيزة", costPrice: 500 }],
  ]);
  const file = (...lines: string[]) =>
    ["المعرف;الكود;المنتج;الشكل;سعر البيع;التكلفة", ...lines].join("\r\n");

  it("بيقرا التكلفة الجديدة", () => {
    const plan = parseCostFile(file("v1;1001;كرسي;;1200;700"), known);
    expect(plan.updates).toEqual([
      { variantId: "v1", name: "كرسي", from: 0, to: 700 },
    ]);
  });

  it("**الخانة الفاضية معناها سيبها زي ما هي مش صفّرها**", () => {
    // أغلب الناس بتملا الناقص بس وتسيب الباقي — لو صفّرناها هنمسح تكاليف صح
    const plan = parseCostFile(file("v2;1002;ترابيزة;;2000;"), known);
    expect(plan.updates).toEqual([]);
    expect(plan.blank).toBe(1);
  });

  it("نفس التكلفة مابتتعدش تغيير", () => {
    const plan = parseCostFile(file("v2;1002;ترابيزة;;2000;500"), known);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("معرف مش موجود بيترفض", () => {
    const plan = parseCostFile(file("v9;1009;حاجة;;100;50"), known);
    expect(plan.unknown).toEqual([{ line: 2, variantId: "v9" }]);
    expect(plan.updates).toEqual([]);
  });

  it("رقم مش مظبوط بيترفض بسببه", () => {
    const plan = parseCostFile(file("v1;1001;كرسي;;1200;تلاتميت"), known);
    expect(plan.invalid).toHaveLength(1);
    expect(plan.invalid[0].reason).toContain("مش رقم");
  });

  it("التكلفة بالسالب بترفض", () => {
    const plan = parseCostFile(file("v1;1001;كرسي;;1200;-50"), known);
    expect(plan.invalid).toHaveLength(1);
    expect(plan.invalid[0].reason).toContain("بالسالب");
  });

  it("بيشتغل من غير سطر عناوين", () => {
    const plan = parseCostFile("v1;1001;كرسي;;1200;700", known);
    expect(plan.updates).toHaveLength(1);
  });

  it("بيتحمّل BOM وسطور فاضية", () => {
    const plan = parseCostFile(
      "﻿" + file("", "v1;1001;كرسي;;1200;700", ""),
      known
    );
    expect(plan.updates).toHaveLength(1);
  });

  it("الاسم اللي بين علامتين بيتقرا صح", () => {
    const plan = parseCostFile(file('v1;1001;"كرسي; مودرن";;1200;700'), known);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].to).toBe(700);
  });

  it("ملف فاضي مايكسرش حاجة", () => {
    const plan = parseCostFile("", known);
    expect(plan.updates).toEqual([]);
    expect(plan.unknown).toEqual([]);
  });

  it("بيفرز ملف فيه كل الحالات", () => {
    const plan = parseCostFile(
      file(
        "v1;1001;كرسي;;1200;700",
        "v2;1002;ترابيزة;;2000;500",
        "v2;1002;ترابيزة;;2000;",
        "v9;1009;حاجة;;100;50",
        "v1;1001;كرسي;;1200;كلام"
      ),
      known
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.unchanged).toBe(1);
    expect(plan.blank).toBe(1);
    expect(plan.unknown).toHaveLength(1);
    expect(plan.invalid).toHaveLength(1);
  });
});

describe("الدايرة كاملة", () => {
  it("اللي بنبنيه بيترقرا تاني صح", () => {
    const built = buildCostFile([
      row("v1", "كرسي", 1200, 0),
      row("v2", "ترابيزة; كبيرة", 2000, 500),
    ]);
    // العميل ملا تكلفة الأول وساب التاني
    const edited = built.replace("v1;1001;كرسي;;1200;", "v1;1001;كرسي;;1200;700");

    const plan = parseCostFile(
      edited,
      new Map([
        ["v1", { name: "كرسي", costPrice: 0 }],
        ["v2", { name: "ترابيزة; كبيرة", costPrice: 500 }],
      ])
    );
    expect(plan.updates).toEqual([
      { variantId: "v1", name: "كرسي", from: 0, to: 700 },
    ]);
    expect(plan.unchanged).toBe(1);
  });
});
