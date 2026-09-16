import { describe, expect, it } from "vitest";
import { csvCell, csvText } from "./csv";

describe("csv", () => {
  it("⚠️ أول الملف BOM — من غيره إكسيل بيكسّر العربي", () => {
    expect(csvText(["اسم"], []).charCodeAt(0)).toBe(0xfeff);
  });

  it("علامة التنصيص جوّه النص بتتضاعف", () => {
    expect(csvCell('قال "أهلا"')).toBe('"قال ""أهلا"""');
  });

  it("الفاصلة والسطر الجديد جوّه الخانة مابيكسروش الصف", () => {
    const text = csvText(["أ", "ب"], [["واحد, اتنين", "سطر\nتاني"]]);
    expect(text).toBe(String.fromCharCode(0xfeff) + '"أ","ب"\r\n"واحد, اتنين","سطر\nتاني"');
  });

  it("الفاضي والصفر", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(0)).toBe('"0"');
  });
});

/**
 * ⚠️ **التصدير كان بيقطع عند ١٠٠٠ صف من غير ما يقول** (`.limit(20000)` —
 * سوبابيز بيرجّع ١٠٠٠ بالكتير). أي حد يرجّع `.limit` كبير هنا الاختبار ده يقع.
 */
describe("التصدير بيجيب كل الصفوف", () => {
  it("مافيش .limit() في مسار التصدير — كله صفحة صفحة", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "app", "export", "route.ts"), "utf8");
    // التعليقات بتحكي عن الباج القديم — الكود بس هو اللي بيتفحص
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/\.limit\(/);
    expect(src).toContain("fetchAllPages");
  });
});
