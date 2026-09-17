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

/**
 * تصنيفات مقفولة: مابتتضافش تاني، والقديم بيفضل زي ما هو.
 *
 * «مرتجعات» — الريفند بقى على الأوردر نفسه وبيطلع حركة خزنة (قرار عمر
 * ١٧ سبتمبر). المسجّل قبل كده **بيفضل في الربح**: هو المكان الوحيد اللي
 * ريفند الأوردرات القديمة متسجّل فيه، ومبيعاتها بقت بتتحسب (ب). فمافيش
 * تاريخ فاصل ولا حسبتين.
 */
export const CLOSED_CATEGORIES: ExcludedCategory[] = [
  {
    category: "مرتجعات",
    why: "الريفند بقى بيتسجّل من صفحة الأوردر",
  },
];

export function closedCategory(
  category: string | null | undefined
): ExcludedCategory | null {
  const c = String(category ?? "").trim();
  return CLOSED_CATEGORIES.find((x) => x.category === c) ?? null;
}
