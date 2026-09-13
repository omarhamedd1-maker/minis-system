import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ⚠️⚠️ حارس طبقات `app/globals.css`.
 *
 * Tailwind v4 حاطط الـutilities جوّه `@layer utilities`، وأي قاعدة **برّه**
 * الطبقات بتغلب على أي طبقة مهما كان الترتيب أو الـspecificity. قبل ما القواعد
 * تتلف في `@layer base` و`@layer components`: `field w-40` كانت بتطلع بعرض
 * الشاشة (١٠١٤px مش ١٦٠)، و`h2.text-danger` لونه غامق، و`font-medium` على
 * عنوان بيطلع ٧٠٠ — واتكشف بالقياس بعد ما نزل.
 *
 * أي قاعدة جديدة تتكتب برّه طبقة بترجّع نفس المشكلة، ومابتتكشفش غير بعد
 * أسابيع. المسموح برّه: `@import` و`:root` و`@theme` و`@keyframes` و`@layer`.
 */

type TopLevel = { head: string; line: number };

/** بيطلع العناصر اللي على المستوى الأول بس — متجاهل التعليقات والنصوص */
function topLevel(css: string): TopLevel[] {
  const out: TopLevel[] = [];
  let depth = 0;
  let head = "";
  let headLine = 1;
  let line = 1;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];

    if (ch === "\n") line++;

    // تعليق
    if (ch === "/" && next === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end < 0 ? css.length : end + 2;
      for (let k = i; k < stop; k++) if (css[k] === "\n") line++;
      i = stop - 1;
      continue;
    }

    // نص بين علامات تنصيص
    if (ch === '"' || ch === "'") {
      const close = css.indexOf(ch, i + 1);
      const stop = close < 0 ? css.length : close;
      if (depth === 0) head += css.slice(i, stop + 1);
      i = stop;
      continue;
    }

    if (depth === 0) {
      if (ch === "{") {
        out.push({ head: head.trim(), line: headLine });
        head = "";
        depth = 1;
      } else if (ch === ";") {
        if (head.trim()) out.push({ head: head.trim(), line: headLine });
        head = "";
      } else {
        if (!head.trim() && ch.trim()) headLine = line;
        head += ch;
      }
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }
  }
  return out;
}

const ALLOWED = [/^@import\b/, /^:root$/, /^@theme\b/, /^@keyframes\b/, /^@layer\b/];

const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

describe("طبقات globals.css", () => {
  it("⚠️⚠️ مافيش قاعدة برّه @layer غير :root و@theme و@keyframes", () => {
    const outside = topLevel(css)
      .filter((t) => !ALLOWED.some((r) => r.test(t.head)))
      .map((t) => `سطر ${t.line}: ${t.head.slice(0, 60)}`);
    expect(outside).toEqual([]);
  });

  it("الطبقتين موجودين", () => {
    const heads = topLevel(css).map((t) => t.head);
    expect(heads).toContain("@layer base");
    expect(heads).toContain("@layer components");
  });

  it("⚠️ القطع الجاهزة جوّه components مش base", () => {
    const comp = css.indexOf("@layer components");
    for (const sel of [".card {", ".btn {", ".field {", ".badge {", ".table {", ".num {", ".money {"]) {
      const at = css.indexOf(sel);
      expect(at, sel).toBeGreaterThan(comp);
    }
  });

  it("الحارس نفسه بيمسك القاعدة اللي برّه", () => {
    // من غير الاختبار ده، parser بايظ بيرجّع قايمة فاضية والحارس الأول بيعدّي دايمًا
    const bad = topLevel(
      [
        '@import "tailwindcss";',
        ":root { --a: 1; }",
        "/* تعليق فيه { و } */",
        "@layer base { h1 { color: red; } }",
        ".leak { width: 100%; }",
        'body::after { content: "}"; }',
      ].join("\n")
    )
      .filter((t) => !ALLOWED.some((r) => r.test(t.head)))
      .map((t) => t.head);
    expect(bad).toEqual([".leak", "body::after"]);
  });
});
