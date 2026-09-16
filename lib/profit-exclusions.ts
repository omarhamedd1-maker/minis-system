/**
 * ==========================================================================
 * مصاريف مابتدخلش في حساب الربح (MONEY §٨.٦ — قرار عمر ١٦–١٧ سبتمبر)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **القاعدة:** أي حاجة بتتشترى مقدم وتتستهلك بعدين بتتحسب مرتين —
 * مرة كمصروف وقت الشرا، ومرة وقت الاستهلاك جوّه تكلفة الأوردر.
 * وأي فلوس خارجة مش مصروف أصلًا (سحب الشركاء) مالهاش مكان في الربح.
 *
 * المصاريف دي **بتفضل مسجّلة** — الفلوس خرجت فعلًا والخزنة صح. بس
 * صافي الربح مابيطرحهاش. الخزنة تشوفها · الربح لأ.
 *
 * أي تصنيف جديد يتفحص بالقاعدة دي قبل ما يتضاف هنا.
 * ==========================================================================
 */

export type ExcludedCategory = {
  category: string;
  /** ليه مابتدخلش — بيتعرض جنب الرقم */
  why: string;
};

export const NOT_IN_PROFIT: ExcludedCategory[] = [
  {
    category: "تصنيع وخامات",
    why: "تكلفتها محسوبة على المنتج وقت البيع",
  },
  {
    category: "باقة بوسطة",
    why: "رصيد شحن مقدم — رسوم بوسطة بتتخصم على كل أوردر",
  },
  {
    category: "سحوبات",
    why: "سحب أرباح للشركاء — مش مصروف",
  },
];

const EXCLUDED = new Set(NOT_IN_PROFIT.map((c) => c.category));

export function countsInProfit(category: string | null | undefined): boolean {
  return !EXCLUDED.has(String(category ?? "").trim());
}

export type ExpenseLike = { amount: number; category?: string | null };

/** المصاريف اللي بتدخل الربح واللي لأ — المجموعين */
export function splitExpenses(expenses: ExpenseLike[]): {
  counted: number;
  excluded: number;
} {
  let counted = 0;
  let excluded = 0;
  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    if (countsInProfit(e.category)) counted += amount;
    else excluded += amount;
  }
  return { counted, excluded };
}
