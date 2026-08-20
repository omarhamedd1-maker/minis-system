// ==========================================================================
// النسخة الاحتياطية — الداتا تطلع برّه السيستم كل يوم
// --------------------------------------------------------------------------
// كل حاجة دلوقتي في مكان واحد: قاعدة بيانات واحدة، حساب واحد. لو الحساب
// اتقفل أو حد مسح بالغلط، **مافيش نسخة تانية في أي مكان**.
//
// ⚠️⚠️ **النسخة اللي في نفس المكان مش نسخة.** لو الملفات اتحفظت جوّه نفس
// الحساب، الحاجة اللي هتوديه هتودّيها معاه. عشان كده الملفات بتتبعت لبرّه —
// على جروب تليجرام — والملف بيبقى **CSV مقروء بإيدك**، مش صيغة محتاجة
// السيستم ده عشان تفتحها.
//
// ⚠️ **والملف بيتعمل من الداتا زي ما هي**، من غير حسابات ولا تلخيص. النسخة
// اللي بتلخّص مابترجّعش اللي ضاع.
//
// **الملف ده صافي** — بياخد صفوف وبيرجّع ملفات. البعت في مكان تاني.
// ==========================================================================

/** BOM عشان إكسيل يفتح العربي صح مش حروف مكسّرة */
const BOM = "\ufeff";

export type BackupFile = {
  /** اسم الملف زي `orders-2026-08-20.csv` */
  name: string;
  /** محتوى الملف جاهز للبعت */
  content: string;
  /** عدد الصفوف من غير سطر العناوين */
  rows: number;
};

function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  // ⚠️ الكائنات بتتكتب JSON عشان `[object Object]` مايبقاش هو النسخة
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * بيحوّل صفوف لـ CSV.
 *
 * ⚠️ **الأعمدة بتتاخد من أول صف** — والصفوف اللي فيها أعمدة زيادة بتتقص،
 * فبنجمع كل المفاتيح من كل الصفوف بدل ما نثق في الأول.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return BOM;

  const keys: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  }

  const lines = [keys.map(cell).join(",")];
  for (const r of rows) lines.push(keys.map((k) => cell(r[k])).join(","));

  return BOM + lines.join("\r\n");
}

export type BackupInput = {
  /** يوم النسخة بصيغة `2026-08-20` */
  day: string;
  tables: { name: string; rows: Record<string, unknown>[] }[];
};

/**
 * بيعمل ملف لكل جدول.
 *
 * ⚠️ **الجدول الفاضي بيتشال** — بعت ملف فاضي كل يوم بيخلّي حد يبطّل يبصّ
 * على النسخة أصلًا.
 */
export function buildBackup(input: BackupInput): BackupFile[] {
  const out: BackupFile[] = [];

  for (const t of input.tables) {
    if (t.rows.length === 0) continue;
    out.push({
      name: `${t.name}-${input.day}.csv`,
      content: toCsv(t.rows),
      rows: t.rows.length,
    });
  }

  return out;
}

/** «٤ ملفات · ٣٬١٢٠ صف» — الجملة اللي بتتبعت مع النسخة */
export function backupSummary(files: BackupFile[], storeName?: string | null): string {
  if (files.length === 0) return "مافيش داتا تتحفظ لسه.";

  const rows = files.reduce((s, f) => s + f.rows, 0);
  const head = storeName ? `نسخة ${storeName}` : "نسخة اليوم";
  const list = files.map((f) => `${f.name.split("-")[0]} ${f.rows}`).join(" · ");

  return `${head} — ${files.length} ملف · ${rows} صف\n${list}`;
}

/** حجم كل النسخة بالبايت — تليجرام بيرفض فوق ٥٠ ميجا للملف */
export const MAX_FILE_BYTES = 45 * 1024 * 1024;

export function tooBig(file: BackupFile): boolean {
  return Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES;
}
