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
    expect(resolveShowCount("1000000")).toBe(1000);
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

  // ⚠️ كانت `.limit(5000)` و`.limit(3000)` — وسوبابيز كان بيقطعهم عند ١٠٠٠
  // بالصمت (NEXT §٣٣). دلوقتي بيجيبوا كل الصفوف.
  it("الشرايح بتجيب كل الأوردرات والعملاء للحساب", () => {
    const src = read("app/(dashboard)/customers/segments/page.tsx");
    expect(src.match(/allRows\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/\.limit\(/);
  });

  it("المرتجعات بتجيب كل حركات المخزون للبحث", () => {
    const src = read("app/(dashboard)/orders/returns/page.tsx");
    expect(src).toMatch(/allRows\(supabase\s*\.from\("stock_movements"\)/);
  });
});
