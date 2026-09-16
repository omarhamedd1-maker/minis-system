/**
 * ==========================================================================
 * دفتر الخزنة — رصيد بعد كل حركة، ومجمّع بالتاريخ
 * --------------------------------------------------------------------------
 * دفتر من غير رصيد جاري مش دفتر: مش هتعرف كنت واقف فين يوم معين.
 *
 * ⚠️⚠️ **الرصيد الجاري بيتحسب من فوق لتحت** — بنبدأ بالرصيد الحالي (من
 * الداتابيز، على كل الحركات) ونطرح كل حركة وإحنا نازلين. ده صح **بشرط**
 * إن الحركات المعروضة هي أول N حركة بنفس ترتيب الدفتر، من غير فجوات.
 * فلتر اتجاه (داخل بس مثلًا) بيكسر الشرط ← الرصيد الجاري مايتعرضش معاه.
 * ==========================================================================
 */

export type LedgerMove = {
  id: string;
  direction: string;
  amount: number;
  transaction_date: string | null;
};

export type WithBalance<T> = T & {
  /** الرصيد بعد الحركة دي */
  balanceAfter: number;
};

export type LedgerDay<T> = {
  /** YYYY-MM-DD */
  day: string;
  totalIn: number;
  totalOut: number;
  rows: T[];
  /**
   * آخر يوم في الصفحة ممكن يكون مقصوص — حركاته الأقدم لسه ماتجابتش.
   * مجاميعه ناقصة، فلازم يتقال.
   */
  partial: boolean;
};

const signed = (m: LedgerMove) =>
  (m.direction === "in" ? 1 : m.direction === "out" ? -1 : 0) * Number(m.amount ?? 0);

/** @param rows مترتبة الأحدث الأول — نفس ترتيب الدفتر */
export function withRunningBalance<T extends LedgerMove>(
  rows: T[],
  currentBalance: number
): WithBalance<T>[] {
  let balance = currentBalance;
  return rows.map((row) => {
    const out = { ...row, balanceAfter: balance };
    balance -= signed(row);
    return out;
  });
}

export const dayOf = (value: string | null) => (value ?? "").slice(0, 10);

/**
 * ⚠️ **اليوم اللي فيه حركة واحدة مالوش عنوان** (قرار عمر، ١٦ سبتمبر).
 * العنوان بيوفّر لما يبقى فيه حركات كتير في اليوم — مع حركة واحدة بيزوّد
 * سطر (التجريبي طوّل من 8,135 لـ11,053px). تاريخها بيرجع جوّه السطر.
 * اليوم المقصوص بياخد عنوان دايمًا — عشان «جزء من اليوم» لازم يتقال.
 */
export const dayHasHeader = (day: { rows: unknown[]; partial: boolean }) =>
  day.rows.length > 1 || day.partial;

/**
 * @param hasMore فيه حركات أقدم ماتجابتش — آخر يوم يتعلّم «مقصوص».
 */
export function groupByDay<T extends LedgerMove>(
  rows: T[],
  hasMore: boolean
): LedgerDay<T>[] {
  const days: LedgerDay<T>[] = [];
  for (const row of rows) {
    const day = dayOf(row.transaction_date);
    let current = days[days.length - 1];
    if (!current || current.day !== day) {
      current = { day, totalIn: 0, totalOut: 0, rows: [], partial: false };
      days.push(current);
    }
    current.rows.push(row);
    if (row.direction === "in") current.totalIn += Number(row.amount ?? 0);
    else if (row.direction === "out") current.totalOut += Number(row.amount ?? 0);
  }
  if (hasMore && days.length > 0) days[days.length - 1].partial = true;
  return days;
}
