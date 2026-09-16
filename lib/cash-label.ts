/**
 * ==========================================================================
 * اسم سطر الخزنة
 * --------------------------------------------------------------------------
 * «أوردر رقم ١٢٨٨» مكررة على كل سطر تحصيل وما بتقولش حاجة — اسم العميل
 * هو اللي بيتفتكر: «أحمد الجندي · ١٢٨٨».
 *
 * ⚠️ **ممنوع يظهر اسم نوع بالإنجليزي** (\`prepaid\` · \`opening\`) — أي نوع
 * جديد لازم ياخد اسم هنا، ولو نسيناه بيظهر «حركة» مش الكلمة الخام.
 * ==========================================================================
 */

export type CashLabelRow = {
  direction: string;
  source_type: string | null;
  description: string | null;
  orders: {
    order_number: string | null;
    customers: { full_name: string | null } | null;
  } | null;
  expenses: { category: string | null; description: string | null } | null;
};

const SOURCE_LABELS: Record<string, string> = {
  expense: "مصروف",
  order: "تحصيل",
  prepaid: "مقدم",
  opening: "رصيد افتتاحي",
  // الوصف بيتكتب وقت الإلغاء («إلغاء: …») وبيظهر هو
  reversal: "إلغاء حركة",
};

export function cashRowLabel(row: CashLabelRow): string {
  if (row.source_type === "manual") {
    const base = row.direction === "in" ? "إيداع يدوي" : "سحب يدوي";
    return row.description ? `${base}: ${row.description}` : base;
  }

  const base = SOURCE_LABELS[row.source_type ?? ""] ?? "حركة";

  if (row.expenses) {
    return `${base}: ${row.expenses.category ?? ""}${
      row.expenses.description ? ` (${row.expenses.description})` : ""
    }`;
  }

  const number = row.orders?.order_number;
  if (number) {
    const name = row.orders?.customers?.full_name?.trim();
    const who = name ? `${name} · ${number}` : `أوردر ${number}`;
    // التحصيل هو الأغلب — مالوش لازمة كلمة قبله. المقدم بيتقال عشان المطابقة مع البنك
    return row.source_type === "order" ? who : `${base}: ${who}`;
  }

  return row.description?.trim() || base;
}
