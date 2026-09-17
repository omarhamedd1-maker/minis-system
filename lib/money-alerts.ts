/**
 * ==========================================================================
 * تنبيهات الفلوس الشاذة (MONEY ٤.٩ · ٦.٧ — الخطوة ١٣)
 * --------------------------------------------------------------------------
 * اتنين بس دلوقتي. «يوم من غير تحصيل» مستني التحويلات.
 *
 * ⚠️ **القواعد اتقاست على البيانات الحقيقية قبل ما تتكتب** (١٧ سبتمبر) —
 * تنبيه بيرن كل أسبوع بيتتشاف ضوضاء وبيتجاهل:
 *
 * - **المصروف المكرر:** نفس النوع والمبلغ والوصف **في نفس اليوم أو اليوم
 *   اللي بعده**. بنافذة ٣ أيام طلع ٦ حالات على مينيز في ٧ شهور (دفعات ورش
 *   بتتكرر عادي)، وبيوم واحد ٢.
 * - **الحركة الكبيرة:** أكبر من **ضعف أكبر حركة سبقتها** من نفس النوع في
 *   ٦ شهور (٥ حركات على الأقل، و٣٠٠٠ جنيه كحد أدنى). المقارنة بالوسيط
 *   طلّعت ١٩ حالة — «تصنيع وخامات» فيها خامات صغيرة ودفعات ورش كبيرة،
 *   فالدفعة العادية كانت بتبان شاذة. بالقاعدة دي: ٢ على مينيز · صفر على ٢ سِك.
 * ==========================================================================
 */

const DAY = 86_400_000;

const dayNumber = (d: string) => Math.floor(Date.parse(d.slice(0, 10) + "T00:00:00Z") / DAY);

const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .replace(/\s+/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ةه]$/, "");

export type AlertExpense = {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
  description: string | null;
};

/** أيام بتتحسب فيها الحالة «جديدة» — بعدها التنبيه بيمشي من الجرس */
export const DUPLICATE_FRESH_DAYS = 14;
export const UNUSUAL_FRESH_DAYS = 7;

export type DuplicatePair = { first: AlertExpense; second: AlertExpense };

export function duplicateExpenses(rows: AlertExpense[], today: string): DuplicatePair[] {
  const sorted = [...rows].sort((a, b) => a.expense_date.localeCompare(b.expense_date));
  const now = dayNumber(today);
  const out: DuplicatePair[] = [];
  const used = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const gap = dayNumber(b.expense_date) - dayNumber(a.expense_date);
      if (gap > 1) break;
      if (used.has(b.id)) continue;
      if (
        a.category === b.category &&
        Number(a.amount) === Number(b.amount) &&
        norm(a.description) === norm(b.description) &&
        now - dayNumber(b.expense_date) <= DUPLICATE_FRESH_DAYS
      ) {
        out.push({ first: a, second: b });
        used.add(a.id);
        used.add(b.id);
        break;
      }
    }
  }
  return out;
}

export type AlertMove = {
  id: string;
  /** اللي بتتقارن بيه: نوع المصروف، أو «داخل/خارج» للحركة اليدوية */
  kind: string;
  amount: number;
  date: string;
  label: string;
};

export type UnusualMove = AlertMove & { previousMax: number };

export const UNUSUAL = { factor: 2, minHistory: 5, minAmount: 3000, lookbackDays: 180 };

export function unusualMoves(rows: AlertMove[], today: string): UnusualMove[] {
  const now = dayNumber(today);
  const out: UnusualMove[] = [];
  for (const r of rows) {
    const d = dayNumber(r.date);
    if (now - d > UNUSUAL_FRESH_DAYS || d > now) continue;
    if (Number(r.amount) < UNUSUAL.minAmount) continue;
    const prior = rows
      .filter(
        (o) =>
          o.kind === r.kind &&
          o.id !== r.id &&
          dayNumber(o.date) < d &&
          d - dayNumber(o.date) <= UNUSUAL.lookbackDays
      )
      .map((o) => Number(o.amount));
    if (prior.length < UNUSUAL.minHistory) continue;
    const previousMax = Math.max(...prior);
    if (Number(r.amount) > UNUSUAL.factor * previousMax) out.push({ ...r, previousMax });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
