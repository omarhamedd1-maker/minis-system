/**
 * ملفات CSV بتتفتح في إكسيل.
 * ⚠️ **BOM في أول الملف** — من غيره إكسيل بيفتح العربي حروف مكسّرة.
 */

/** علامة UTF-8 في أول الملف — مكتوبة بالكود عشان ماتضيعش كحرف مخفي */
const BOM = String.fromCharCode(0xfeff);

export function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvText(header: string[], rows: (string | number | null | undefined)[][]): string {
  return (
    BOM +
    [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")
  );
}

/** @param dateSuffix بيتكتب في آخر اسم الملف (عادةً النهارده) */
export function csvResponse(text: string, name: string, dateSuffix: string): Response {
  return new Response(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${dateSuffix}.csv"`,
    },
  });
}
