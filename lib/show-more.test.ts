import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveShowCount, SHOW_STEP } from "./show-more";

describe("resolveShowCount", () => {
  it("من غير باراميتر بيبدأ من ٥٠", () => {
    expect(resolveShowCount(undefined)).toBe(SHOW_STEP);
  });

  it("أقل من ٥٠ بيترفع لـ٥٠ — عشان حد مايقللش العرض بلينك", () => {
    expect(resolveShowCount("1")).toBe(SHOW_STEP);
    expect(resolveShowCount("0")).toBe(SHOW_STEP);
    expect(resolveShowCount("-100")).toBe(SHOW_STEP);
  });

  it("كلام مش رقم بيرجع للافتراضي مش NaN", () => {
    expect(resolveShowCount("كتير")).toBe(SHOW_STEP);
    expect(resolveShowCount("")).toBe(SHOW_STEP);
  });

  it("بيزود بخطوة ٥٠", () => {
    expect(resolveShowCount("100")).toBe(100);
    expect(resolveShowCount("150")).toBe(150);
  });

  it("فيه سقف — لينك بمليون مايجيبش الدنيا كلها", () => {
    expect(resolveShowCount("1000000")).toBe(5000);
  });
});

/**
 * ⚠️⚠️ **حد العرض ≠ حد البيانات.**
 * الأرقام دي بتتجاب عشان **حساب** مش عشان عرض — لو حد قلّلها لـ٥٠ الصفحات
 * هتعرض أرقام غلط من غير رسالة خطأ. الاختبار ده بيمسكها.
 */
describe("حدود البيانات ما اتلمستش", () => {
  const root = join(__dirname, "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("الشرايح لسه بتجيب ٥٠٠٠ صف للحساب", () => {
    const src = read("app/(dashboard)/customers/segments/page.tsx");
    expect(src).toContain(".limit(5000)");
  });

  it("المرتجعات لسه بتجيب ٣٠٠٠ حركة مخزون للبحث", () => {
    const src = read("app/(dashboard)/orders/returns/page.tsx");
    expect(src).toContain(".limit(3000)");
  });
});
