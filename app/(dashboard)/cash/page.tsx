import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { can, requireAnyPagePermission } from "@/lib/permissions";
import { loadCashTotals } from "@/lib/cash-totals";
import { moneyTabsFor, pickMoneyTab } from "@/lib/money-tabs";
import { MovesTab } from "./MovesTab";
import { BalanceFigure } from "./BalanceFigure";
import { ExpensesTab } from "./ExpensesTab";
import { TransfersTab } from "./TransfersTab";

/**
 * ==========================================================================
 * الفلوس — الخزنة والمصاريف في صفحة واحدة (قرار عمر، ١٦ سبتمبر)
 * --------------------------------------------------------------------------
 * كل مصروف بيعمل حركة خزنة، فكانت نفس البيانات في صفحتين. والأهم: كنت
 * بتسجّل مصاريف وانت مش شايف رصيدك.
 *
 * ⚠️ **`/expenses` لسه شغّالة وبتحوّل على `?tab=expenses`** بكل باراميتراتها —
 * ممنوع لينك قديم يتكسر.
 *
 * ⚠️ **كل تاب بصلاحيته** — «الخزنة» و«المصاريف» صلاحيتين منفصلتين، وحساب ممكن
 * يبقى معاه واحدة بس. والرصيد بـ`cash.view` بس.
 * ==========================================================================
 */
export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireAnyPagePermission(["cash.view", "expenses.view"]);
  const tabs = moneyTabsFor((p) => can(user, p));
  const tab = pickMoneyTab(params.tab, tabs);
  const canCash = can(user, "cash.view");

  // ⚠️ الرصيد من الداتابيز — الجمع في الصفحة كان بيقصّ عند ١٠٠٠ حركة بالصمت
  let totals = null;
  let totalsError: string | null = null;
  if (canCash) {
    try {
      totals = await loadCashTotals(await createClient(), user.tenantId);
    } catch (e) {
      totalsError = (e as Error).message;
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink">الفلوس</h1>

      {totalsError && (
        <div className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
          حصل خطأ أثناء حساب الرصيد: {totalsError}
        </div>
      )}

      {/* التابات والرصيد على سطر واحد — الرصيد هو الرقم الأساسي في الصفحة */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line">
        {tabs.length > 1 ? (
        <nav aria-label="أقسام الفلوس" className="flex gap-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/cash?tab=${t.key}`}
              aria-current={t.key === tab ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                t.key === tab
                  ? "border-primary text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        ) : (
          <span />
        )}
        {totals && <BalanceFigure balance={totals.balance} />}
      </div>

      {tab === "expenses" ? (
        <ExpensesTab params={params} user={user} />
      ) : tab === "transfers" ? (
        <TransfersTab user={user} />
      ) : totals ? (
        <MovesTab params={params} user={user} totals={totals} />
      ) : null}
    </div>
  );
}
