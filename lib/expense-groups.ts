/**
 * ==========================================================================
 * مجموعات أنواع المصاريف (MONEY §٤.٦ · الخطوة ٨)
 * --------------------------------------------------------------------------
 * مبنية على **الأنواع اللي مينيز و2 SEC بيستخدموها فعلًا** (١٧ سبتمبر)،
 * مش على أنواع التجريبي. الأنواع اللي مش هنا (نوع جديد كتبه حد) بتروح
 * «تشغيل» — مابتختفيش.
 *
 * ⚠️⚠️ **«برّه الربح» بتيجي من `NOT_IN_PROFIT` مش من القايمة هنا.**
 * الخامات والباقة والسحوبات مصاريف في الخزنة ومابتتطرحش من الربح، فلو
 * اتحطت في «تكلفة البيع» مثلًا كان الرقم هيبان كأنه متطرح. مصدر واحد
 * بيمنع الاتنين يختلفوا.
 *
 * **العرض بس** — المجموعات مابتغيّرش أي معادلة.
 * ==========================================================================
 */

import { NOT_IN_PROFIT, countsInProfit } from "./profit-exclusions";

export type ExpenseGroupKey = "sale" | "marketing" | "running" | "outside";

export type ExpenseGroup = {
  key: ExpenseGroupKey;
  label: string;
  categories: string[];
};

export const EXPENSE_GROUPS: ExpenseGroup[] = [
  {
    key: "sale",
    label: "تكلفة البيع",
    // «مرتجعات» اتقفلت بس قديمها لسه بيتعرض ويتفلتر
    categories: ["بضاعة", "تغليف", "شحن", "مرتجعات"],
  },
  { key: "marketing", label: "تسويق", categories: ["إعلانات", "تسويق"] },
  {
    key: "running",
    label: "تشغيل",
    categories: ["اشتراكات", "مواصلات", "مرتبات", "إيجار", "أخرى"],
  },
  {
    key: "outside",
    label: "برّه الربح",
    categories: NOT_IN_PROFIT.map((c) => c.category),
  },
];

const clean = (c: string | null | undefined) => String(c ?? "").trim();

export function groupOf(category: string | null | undefined): ExpenseGroup {
  const c = clean(category);
  if (!countsInProfit(c)) return EXPENSE_GROUPS.find((g) => g.key === "outside")!;
  return (
    EXPENSE_GROUPS.find((g) => g.key !== "outside" && g.categories.includes(c)) ??
    EXPENSE_GROUPS.find((g) => g.key === "running")!
  );
}

/**
 * الأنواع متقسّمة بالمجموعة — للمنسدلات.
 *
 * جوّه المجموعة: بترتيب القايمة، والأنواع الجديدة بعدها بالأبجدية.
 * المجموعة الفاضية مابتظهرش.
 */
export function groupCategories(
  categories: string[]
): { label: string; categories: string[] }[] {
  const unique = [...new Set(categories.map(clean).filter(Boolean))];
  return EXPENSE_GROUPS.map((g) => {
    const mine = unique.filter((c) => groupOf(c).key === g.key);
    const known = g.categories.filter((c) => mine.includes(c));
    const extra = mine
      .filter((c) => !g.categories.includes(c))
      .sort((a, b) => a.localeCompare(b, "ar"));
    return { label: g.label, categories: [...known, ...extra] };
  }).filter((g) => g.categories.length > 0);
}

/** مجموع كل مجموعة — المجموعات اللي صفر مابتظهرش */
export function groupTotals(
  expenses: { amount: number; category?: string | null }[]
): { key: ExpenseGroupKey; label: string; total: number }[] {
  const sums = new Map<ExpenseGroupKey, number>();
  for (const e of expenses) {
    const k = groupOf(e.category).key;
    sums.set(k, (sums.get(k) ?? 0) + (Number(e.amount) || 0));
  }
  return EXPENSE_GROUPS.filter((g) => (sums.get(g.key) ?? 0) !== 0).map((g) => ({
    key: g.key,
    label: g.label,
    total: sums.get(g.key)!,
  }));
}
