/**
 * ==========================================================================
 * تفصيل رسوم شركة الشحن — من **الكشف** مش من الإيميل (TRANSFERS §٧)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **البند ده كان متسجّل «مرفوض — الإيميل بيدّي رقم واحد».** وده كان
 * صح عن الإيميل وغلط عن الكشف: الكشف الأصلي فيه عمود `Category` بتسع
 * تصنيفات، والتصالح بينهم وبين التحويلات **صفر بالمليم**
 * (٥٣٧,٥٩٨ − ٢٨,٦٠٣٫٨٩ + ٢,٨١٨٫٨٠ − ٢٥ + ٢٩٥ = ٥١٢,٠٨٢٫٩١).
 *
 * ⚠️ **والسبب إننا اتأخرنا شهر**: كنا بنقرا ملف **مشتق** (٣ أعمدة من ٨)
 * وفاكرينه الكشف الكامل (CONTEXT قاعدة ٩).
 *
 * ⚠️⚠️ **والتصنيفات التلاتة دي أنواع مختلفة تمامًا** (قرار عمر ٢٢ سبتمبر):
 *
 *   **رسوم شحن** — بتكبر مع عدد الشحنات، وقابلة للتفاوض على السعر
 *   **مصاريف ثابتة** — مابتكبرش مع النمو (اشتراك · استلام · تغليف)
 *   **دخل** — تعويضات عن شحنات ضاعت، وشحن رصيد. **موجبة مش مصروف**
 *
 * الخلط بينهم بيخفي إن واحد منهم بيكبر والتاني لأ، وإن جزء منهم **دخل**
 * مش تكلفة.
 *
 * **الملف ده صافي.**
 * ==========================================================================
 */

export type FeeGroup = "shipping" | "fixed" | "income" | "other";

/** التصنيفات زي ما بوسطة بتكتبها في الكشف */
const GROUPS: Record<string, FeeGroup> = {
  "bosta fees cycle": "shipping",
  "bundle subscription": "fixed",
  "pickup fees": "fixed",
  "packing material": "fixed",
  compensation: "income",
  "recharge balance": "income",
  "balance adjustment": "other",
  // دول مش رسوم أصلًا — التحصيل والتحويل نفسه
  "cash collection cycle": "other",
  "cash out": "other",
};

export const GROUP_LABEL: Record<FeeGroup, string> = {
  shipping: "رسوم شحن",
  fixed: "مصاريف ثابتة",
  income: "دخل من بوسطة",
  other: "غير ده",
};

export function feeGroup(category: string): FeeGroup {
  return GROUPS[String(category ?? "").trim().toLowerCase()] ?? "other";
}

export type FeeLine = { category: string; amount: number };

export type FeeBreakdown = {
  /** رسوم الشحن — بالموجب */
  shipping: number;
  /** المصاريف الثابتة — بالموجب */
  fixed: number;
  /** الدخل من بوسطة — بالموجب */
  income: number;
  /** رسوم الشحن + الثابتة − الدخل */
  net: number;
  /** إجمالي التحصيل — المقام بتاع النسبة */
  collection: number;
  /**
   * الرسوم كنسبة من التحصيل.
   *
   * ⚠️ **دي الرقم اللي بيتقارن شهر بشهر** — الرقم المطلق بيكبر مع النمو
   * فمايقولش حاجة لوحده (قرار عمر).
   */
  percent: number | null;
  /** كل تصنيف ومجموعه — للعرض تحت */
  lines: { category: string; group: FeeGroup; amount: number }[];
};

export function breakdownFees(rows: FeeLine[], collection: number): FeeBreakdown {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    sums.set(r.category, round((sums.get(r.category) ?? 0) + amount));
  }

  let shipping = 0;
  let fixed = 0;
  let income = 0;
  const lines: FeeBreakdown["lines"] = [];
  for (const [category, amount] of sums) {
    const group = feeGroup(category);
    if (group === "other") continue;
    // ⚠️ الكشف بيكتب الرسوم بالسالب والدخل بالموجب — بنوحّدهم للعرض
    const value = Math.abs(amount);
    if (group === "shipping") shipping += value;
    else if (group === "fixed") fixed += value;
    else income += value;
    lines.push({ category, group, amount: value });
  }

  const net = round(shipping + fixed - income);
  return {
    shipping: round(shipping),
    fixed: round(fixed),
    income: round(income),
    net,
    collection: round(collection),
    // ⚠️ التحصيل صفر = مفيش نسبة، مش صفر بالمية
    percent: collection > 0 ? Math.round((net / collection) * 10000) / 100 : null,
    lines: lines.sort((a, b) => b.amount - a.amount),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
