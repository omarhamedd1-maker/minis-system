/**
 * ==========================================================================
 * قراية قايمة من غير حد — بتقف عند ١٠٠٠ صف بالصمت (NEXT §٣٣)
 * --------------------------------------------------------------------------
 * بيدوّر في كود المشروع على `.from("…").select(…)` مالهاش `.limit` ولا
 * `.range` ولا `.single` ولا `head: true`، ومش ملفوفة بـ`allRows`، ومش
 * متفلترة بـ`id`. بيستخدمه اختبار الحارس (`lib/fetch-all-pages.test.ts`).
 * ==========================================================================
 */

export type UnboundedRead = { table: string; line: number };

/** آخر سلسلة الاستعلام — بيعدّي الأقواس والأنواع اللي على كذا سطر والتعليقات */
function chainEnd(src: string, start: number): number {
  let depth = 0;
  let angle = 0;
  for (let i = start; i < src.length; i++) {
    if (src.startsWith(".overrideTypes<", i)) {
      angle++;
      i += ".overrideTypes<".length - 1;
      continue;
    }
    const ch = src[i];
    if (angle > 0) {
      if (ch === "<") angle++;
      else if (ch === ">") angle--;
      continue;
    }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0) return i;
      depth--;
    } else if (depth === 0) {
      if (ch === ";" || ch === "," || ch === ":") return i;
      if (ch === "\n") {
        // السطر اللي بعده لازم يبدأ بنقطة أو تعليق عشان السلسلة تكمّل
        const rest = src.slice(i + 1).match(/^\s*(\S\S?)/);
        if (!rest || !(rest[1].startsWith(".") || rest[1] === "//")) return i;
        if (rest[1] === "//") {
          // عدّي سطر التعليق كله — والسطر اللي بعده بيتفحص في اللفة الجاية
          const next = src.indexOf("\n", src.indexOf("//", i));
          if (next < 0) return src.length;
          i = next - 1;
        }
      }
    }
  }
  return src.length;
}

export function findUnboundedReads(src: string): UnboundedRead[] {
  const out: UnboundedRead[] = [];
  const re = /\.from\(\s*["'](\w+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    if (/^\s*(\/\/|\*)/.test(src.slice(lineStart, m.index))) continue;
    const chain = src.slice(m.index, chainEnd(src, m.index));
    if (!/^\.from\(\s*["']\w+["']\s*\)\s*\.select\(/.test(chain)) continue;
    if (/\.(limit|range|single|maybeSingle)\(|head:\s*true/.test(chain)) continue;
    if (/\.(eq|match)\(\s*["']id["']/.test(chain)) continue;
    const before = src.slice(Math.max(0, m.index - 80), m.index).replace(/\s+/g, " ");
    if (/allRows\(\s*(\w+|createAdminClient\(\))\s*$/.test(before)) continue;
    out.push({ table: m[1], line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}
