import { inflateRawSync } from "node:zlib";

/**
 * ==========================================================================
 * قراية ملف إكسل (.xlsx) → CSV (TRANSFERS §٩)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **كشف بوسطة بينزل `.xlsx` مش CSV.** الرافع كان بيقبل CSV بس،
 * والشاشة كانت بتقول «احفظه CSV» — يعني كل مشتري للسيستم مطلوب منه يفتح
 * إكسل ويحوّل الملف بإيده قبل أي رفعة. وده اللي خلّى عمر يرفع الملف
 * **المقصوص** مرتين، ومعاه ضاعت بنود الرسوم.
 *
 * ⚠️ **ومن غير مكتبة.** الـ`.xlsx` ملف zip جوّه XML، والفك بـ`zlib`
 * الموجودة في نود أصلًا. إضافة مكتبة كاملة عشان جدول واحد تكلفة مالهاش
 * لازمة.
 *
 * ⚠️ **بنقرا فهرس الملف مش أول الملفات**: بعض المولّدات بتسيب الأحجام
 * صفر في الترويسة المحلية وتكتبها بعد الداتا (bit 3)، فالمسح من الأول
 * بيطلّع بيانات مقطوعة. الفهرس المركزي في الآخر بيدّي الأحجام دايمًا.
 * ==========================================================================
 */

type Entry = { name: string; data: Buffer };

/** بيفك الـzip من فهرسه المركزي */
function unzip(buf: Buffer): Entry[] {
  // ⚠️ نهاية الفهرس ممكن يكون وراها تعليق، فبندوّر عليها من الآخر
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("الملف ده مش إكسل سليم");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Entry[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // الترويسة المحلية: نتخطّى الاسم والزيادة عشان نوصل للداتا
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);

    out.push({ name, data: method === 0 ? raw : inflateRawSync(raw) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");

/** النصوص المشتركة — بعض المولّدات بتحطها في ملف لوحده */
function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join("")
  );
}

/** عمود من مرجع الخلية: `C12` → 2 */
function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const csvCell = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/**
 * أول ورقة في الملف → CSV.
 *
 * ⚠️ **الخلية الفاضية بتفضل فاضية في مكانها** — الأعمدة بتتعرف بالاسم في
 * `lib/payout-statement.ts`، فالتزحزح بيقلب الرسوم بالمبلغ.
 */
export function xlsxToCsv(bytes: Buffer): string {
  const files = unzip(bytes);
  const sheet = files.find((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name));
  if (!sheet) throw new Error("مالقيناش ورقة بيانات في الملف");
  const shared = sharedStrings(
    files.find((f) => f.name === "xl/sharedStrings.xml")?.data.toString("utf8") ?? null
  );
  const xml = sheet.data.toString("utf8");

  const rows: string[][] = [];
  for (const rowXml of xml.split("<row ").slice(1)) {
    const cells: string[] = [];
    for (const c of rowXml.split("<c ").slice(1)) {
      const ref = /r="([A-Z]+\d+)"/.exec(c)?.[1];
      const type = /t="([^"]+)"/.exec(c)?.[1];
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c);
      const v = /<v>([\s\S]*?)<\/v>/.exec(c);
      let value = "";
      if (inline) value = unescapeXml(inline[1]);
      else if (v) {
        value = type === "s" ? (shared[Number(v[1])] ?? "") : unescapeXml(v[1]);
      }
      const at = ref ? colIndex(ref) : cells.length;
      while (cells.length < at) cells.push("");
      cells[at] = value;
    }
    rows.push(cells);
  }
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  return rows
    .map((r) => Array.from({ length: width }, (_, i) => csvCell(r[i] ?? "")).join(","))
    .join("\n");
}

/** بيقرا الملف اللي جاي من المتصفح (base64) */
export function xlsxBase64ToCsv(base64: string): string {
  return xlsxToCsv(Buffer.from(base64, "base64"));
}
