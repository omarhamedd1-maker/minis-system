// ==========================================================================
// التقرير الشهري — ورقة واحدة
// --------------------------------------------------------------------------
// الداشبورد بتقولك «الشهر ده». الورقة دي بتقولك **الاتجاه**: بعت كام الشهر
// اللي فات، والقبله، وهل ماشي لفوق ولا لتحت. ده السؤال اللي بتتسأله لما
// تكلّم شريك أو محاسب، أو لما تقرر تشتري بضاعة.
//
// ⚠️⚠️ **الحسبة مش متكتبة تاني هنا.** بننادي `computeHeadline` نفسها اللي
// الداشبورد بتستخدمها، مرة لكل شهر. لو كتبنا حسبة تانية هنا، كنا هنقع في
// أوحش حاجة ممكنة: **رقمين مختلفين لنفس الشهر في شاشتين**، ومحدش يعرف
// مين الصح.
//
// **الملف ده صافي** — مافيش شبكة ولا قاعدة بيانات ولا وقت من نفسه.
// ==========================================================================

import {
  computeHeadline,
  type Headline,
  type StatExpense,
  type StatOrder,
} from "./dashboard-stats";

export type MonthRow = {
  /** `2026-08` */
  month: string;
  /** «أغسطس ٢٠٢٦» */
  label: string;
  head: Headline;
  /** رجع كام أوردر في الشهر ده */
  returned: number;
  /** نسبة الرجوع ٪ من اللي اتشحن */
  returnRate: number;
  /** الفرق في صافي الربح عن الشهر اللي قبله — `null` لأول شهر */
  profitDelta: number | null;
};

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** الحالات اللي معناها إن الطرد خرج فعلًا */
const WENT_OUT = ["delivered", "returned", "returned_after_delivery"];
const CAME_BACK = ["returned", "returned_after_delivery"];

/** آخر يوم في الشهر — بيتحسب من أول يوم في الشهر اللي بعده ناقص يوم */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** أسماء آخر `count` شهر لحد `today` (الأحدث الأول) */
export function lastMonths(today: string, count: number): string[] {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${AR_MONTHS[m - 1] ?? month} ${y}`;
}

/**
 * صفوف الشهور — الأحدث الأول.
 *
 * ⚠️ **الفرق بيتحسب عن الشهر اللي قبله زمنيًا**، مش عن الصف اللي بعده في
 * القايمة. لو رتّبنا بالعكس يوم، الفرق يفضل صح.
 */
export function monthlyReport(
  orders: StatOrder[],
  expenses: (StatExpense & { expense_date?: string | null })[],
  today: string,
  count = 6
): MonthRow[] {
  const months = lastMonths(today, count);

  const heads = new Map<string, Headline>();
  const backs = new Map<string, { out: number; back: number }>();

  for (const month of months) {
    const start = `${month}-01`;
    const end = monthEnd(month);

    // **المصاريف بتتفلتر بتاريخها** — `computeHeadline` بتجمع اللي بيوصلها
    // كله، فلو بعتنا مصاريف السنة كلها كل شهر هياخد مصاريف السنة
    const monthExpenses = expenses.filter((e) => {
      const d = String(e.expense_date ?? "").slice(0, 10);
      return d >= start && d <= end;
    });

    heads.set(month, computeHeadline(orders, monthExpenses, start, end));

    let out = 0;
    let back = 0;
    for (const o of orders) {
      const d = String(o.order_date ?? "").slice(0, 10);
      if (d < start || d > end) continue;
      const st = String(o.order_status ?? "");
      if (!WENT_OUT.includes(st)) continue;
      out++;
      if (CAME_BACK.includes(st)) back++;
    }
    backs.set(month, { out, back });
  }

  return months.map((month) => {
    const head = heads.get(month)!;
    const b = backs.get(month)!;
    const prevMonth = lastMonths(`${month}-01`, 2)[1];
    const prev = heads.get(prevMonth);
    return {
      month,
      label: monthLabel(month),
      head,
      returned: b.back,
      returnRate: b.out === 0 ? 0 : Math.round((b.back / b.out) * 100),
      profitDelta: prev ? head.netProfit - prev.netProfit : null,
    };
  });
}
