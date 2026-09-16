import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "./fetch-all-pages";

/**
 * ==========================================================================
 * رصيد الخزنة — مصدر واحد
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **ممنوع أي صفحة تجمع حركات الخزنة بنفسها.** سوبابيز بيرجّع ١٠٠٠ صف
 * بالكتير (حتى لو كتبت `.limit(5000)`)، فالجمع في الصفحة بيطلع رصيد غلط
 * بالصمت أول ما الحركات تعدّي الألف.
 *
 * الطريق الأساسي: دالة `cash_totals` في الداتابيز (`sql/cash-totals.sql`).
 * ولو الدالة لسه ماتعملتش: بنجيب الحركات **صفحة صفحة لحد ما تخلص** —
 * أبطأ، بس مابيقصّش.
 * ==========================================================================
 */

export type CashTotals = {
  totalIn: number;
  totalOut: number;
  balance: number;
  countAll: number;
  countIn: number;
  countOut: number;
};

type Move = { direction: string; amount: number | string | null };

export function sumCash(rows: Move[]): CashTotals {
  let totalIn = 0;
  let totalOut = 0;
  let countIn = 0;
  let countOut = 0;
  for (const r of rows) {
    const amount = Number(r.amount ?? 0);
    if (r.direction === "in") {
      totalIn += amount;
      countIn++;
    } else if (r.direction === "out") {
      totalOut += amount;
      countOut++;
    }
  }
  return {
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
    countAll: rows.length,
    countIn,
    countOut,
  };
}

// الصفحات اتنقلت لملف لوحدها — بتتستخدم برّه الخزنة كمان (التصدير)
export { fetchAllPages, PAGE_SIZE } from "./fetch-all-pages";

/** الدالة مش موجودة في الداتابيز لسه — مش خطأ حقيقي */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function/i.test(error.message ?? "")
  );
}

/**
 * @param tenantId ⚠️ **إجباري دايمًا** — مفتاح الأدمن بيعدّي فوق قواعد العزل،
 *   ومع جلسة المستخدم العادية الفلتر ده مابيضرّش.
 */
export async function loadCashTotals(
  db: SupabaseClient,
  tenantId: string
): Promise<CashTotals> {
  const { data, error } = await db.rpc("cash_totals", { p_tenant: tenantId });

  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          total_in: number | string;
          total_out: number | string;
          count_all: number | string;
          count_in: number | string;
          count_out: number | string;
        }
      | undefined;
    const totalIn = Number(row?.total_in ?? 0);
    const totalOut = Number(row?.total_out ?? 0);
    return {
      totalIn,
      totalOut,
      balance: totalIn - totalOut,
      countAll: Number(row?.count_all ?? 0),
      countIn: Number(row?.count_in ?? 0),
      countOut: Number(row?.count_out ?? 0),
    };
  }

  if (!isMissingFunction(error)) throw new Error(error.message);

  const rows = await fetchAllPages<Move>(
    (from, to) =>
      db
        .from("cash_transactions")
        .select("direction, amount")
        .eq("tenant_id", tenantId)
        // ترتيب ثابت — من غيره الصفحات ممكن تتداخل أو تفوّت صفوف
        .order("id")
        .range(from, to)
  );
  return sumCash(rows);
}
