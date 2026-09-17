import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFunction } from "./cash-totals";
import type { Headline } from "./dashboard-stats";

/**
 * ==========================================================================
 * أرقام الربح من الداتابيز (`sql/profit-headline.sql`)
 * --------------------------------------------------------------------------
 * نفس `computeHeadline` بالظبط، بس الجمع بيحصل في الداتابيز — فالصفحة
 * مابتجيبش كل الأوردرات ببنودها عشان ١٢ رقم.
 *
 * ⚠️ **`null` = الدالة لسه ماتعملتش** — اللي بينادي بيرجع للحسبة في الكود.
 * أي خطأ تاني بيترمي: رقم غلط أخطر من صفحة واقعة.
 *
 * @param tenantId ⚠️ **إجباري** — مفتاح الأدمن بيعدّي فوق قواعد العزل.
 * ==========================================================================
 */

type Row = {
  sales: number | string;
  gross_sales: number | string;
  profit: number | string;
  expenses_total: number | string;
  expenses_excluded: number | string;
  shipping_revenue: number | string;
  shipped_count: number | string;
  bosta_shipping_total: number | string;
  net_shipping: number | string;
  net_profit: number | string;
  cod: number | string;
  order_count: number | string;
};

export function headlineFromRow(row: Row | undefined): Headline {
  const n = (k: keyof Row) => Number(row?.[k] ?? 0);
  const orderCount = n("order_count");
  const sales = n("sales");
  return {
    sales,
    grossSales: n("gross_sales"),
    profit: n("profit"),
    expensesTotal: n("expenses_total"),
    expensesExcluded: n("expenses_excluded"),
    shippingRevenue: n("shipping_revenue"),
    shippedCount: n("shipped_count"),
    bostaShippingTotal: n("bosta_shipping_total"),
    netShipping: n("net_shipping"),
    netProfit: n("net_profit"),
    cod: n("cod"),
    orderCount,
    avgOrder: orderCount > 0 ? sales / orderCount : 0,
  };
}

export async function loadHeadline(
  db: SupabaseClient,
  tenantId: string,
  from: string,
  to: string
): Promise<Headline | null> {
  const { data, error } = await db.rpc("profit_headline", {
    p_tenant: tenantId,
    p_from: from,
    p_to: to,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw new Error(error.message);
  }
  return headlineFromRow((Array.isArray(data) ? data[0] : data) as Row | undefined);
}
