import type { PermissionKey } from "./permission-keys";

/**
 * تابات صفحة الفلوس — كل تاب بصلاحيته.
 * «التحويلات» جاية في مواصفة لوحدها (`docs/TRANSFERS-REDESIGN.md`).
 */
export type MoneyTabKey = "moves" | "expenses";

/** الترتيب قرار عمر (١٧ سبتمبر): المصاريف الأول — وأول تاب هو اللي بيفتح */
export const MONEY_TABS: { key: MoneyTabKey; label: string; perm: PermissionKey }[] = [
  { key: "expenses", label: "المصاريف", perm: "expenses.view" },
  { key: "moves", label: "الحركات", perm: "cash.view" },
];

export function moneyTabsFor(has: (perm: PermissionKey) => boolean) {
  return MONEY_TABS.filter((t) => has(t.perm));
}

/**
 * التاب المطلوب لو مسموح — وإلا أول تاب مسموح.
 * لينك `?tab=expenses` مع حساب مالوش المصاريف مابيوقعش، بيفتح الحركات.
 */
export function pickMoneyTab(
  requested: string | undefined,
  allowed: { key: MoneyTabKey }[]
): MoneyTabKey {
  const hit = allowed.find((t) => t.key === requested);
  return (hit ?? allowed[0])?.key ?? "moves";
}

/**
 * ⚠️ **`/expenses` القديمة ← `/cash?tab=expenses` بكل باراميتراتها.**
 * لينك محفوظ على فترة أو نوع لازم يفتح نفس الفترة والنوع.
 */
export function expensesRedirectPath(
  params: Record<string, string | string[] | undefined>
): string {
  const q = new URLSearchParams();
  q.set("tab", "expenses");
  for (const [k, v] of Object.entries(params)) {
    if (k === "tab" || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) q.append(k, one);
  }
  return `/cash?${q.toString()}`;
}
