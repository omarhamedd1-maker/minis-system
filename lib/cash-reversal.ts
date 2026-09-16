import type { SupabaseClient } from "@supabase/supabase-js";
import { cashRowLabel, type CashLabelRow } from "./cash-label";

/**
 * ==========================================================================
 * الخزنة: مين سجّل · والإلغاء بحركة عكسية (MONEY ٦.١ · ٦.٢)
 * --------------------------------------------------------------------------
 * ⚠️⚠️ **حركة الخزنة مابتتمسحش.** المسح كان بيغيّر الرصيد بأثر رجعي ومحدش
 * يعرف ليه. الإلغاء دلوقتي حركة بالعكس **بتاريخ النهارده** — الأصل بيفضل
 * مكانه، والرصيد بيوصل لنفس النتيجة، والتاريخ باين.
 *
 * ⚠️ الاستثناء الوحيد: الرجوع عن عملية **فشلت في نفس الطلب** (الصف لسه
 * متكتب من ثانية ومحدش شافه) — دي بتتمسح عادي.
 *
 * محتاج `sql/cash-audit.sql` (اتشغّل ١٦ سبتمبر): خانات `created_by` ·
 * `created_by_name` · `origin` · `reversal_of`، والربط بالمصروف والأوردر
 * بيتفضّى عند المسح بدل ما يمنعه.
 * ==========================================================================
 */

export type CashOrigin = "app" | "bosta-cashout" | "prepaid" | "import" | "system";

export type CashActor = {
  appUserId: string | null;
  fullName: string | null;
  email: string | null;
};

/** الخانات اللي بتتكتب مع أي حركة جديدة */
export function auditFields(actor: CashActor | null, origin: CashOrigin) {
  return {
    created_by: actor?.appUserId ?? null,
    created_by_name: actor ? (actor.fullName ?? actor.email ?? null) : null,
    origin,
  };
}

/** مصدر الحركة زي ما بيتعرض — فاضي للحركات القديمة اللي قبل الخانات دي */
export function cashSourceNote(row: {
  created_by_name?: string | null;
  origin?: string | null;
}): string | null {
  if (row.created_by_name) return `سجّلها ${row.created_by_name}`;
  switch (row.origin) {
    case "bosta-cashout":
      return "من تحويل بوسطة";
    case "prepaid":
      return "من المدفوع مقدم";
    case "import":
      return "من الاستيراد";
    case "system":
      return "السيستم";
    default:
      return null;
  }
}

export type ReversibleRow = CashLabelRow & {
  id: string;
  amount: number;
  reversal_of?: string | null;
};

/** الحركة العكسية — نفس المبلغ، الاتجاه بالعكس، بتاريخ النهارده */
export function buildReversal(
  row: ReversibleRow,
  tenantId: string,
  actor: CashActor | null,
  today: string
) {
  return {
    tenant_id: tenantId,
    direction: row.direction === "in" ? "out" : "in",
    amount: row.amount,
    source_type: "reversal",
    reversal_of: row.id,
    description: `إلغاء: ${cashRowLabel(row)}`,
    transaction_date: today,
    ...auditFields(actor, "app"),
  };
}

const SELECT =
  "id, direction, amount, source_type, description, reversal_of, orders(order_number, customers(full_name)), expenses(category, description)";

/**
 * بيلغي الحركات دي بحركات عكسية.
 *
 * - الحركة العكسية نفسها مابتتلغيش (إلغاء الإلغاء = لخبطة).
 * - الحركة اللي اتلغت قبل كده بتتعدّى (الفهرس في الداتابيز بيمنع التكرار كمان).
 *
 * ⚠️ **لازم يتنادى قبل مسح المصروف أو الأوردر** — الوصف بيتكتب من بياناتهم.
 */
export async function reverseCashRows(
  db: SupabaseClient,
  tenantId: string,
  ids: string[],
  actor: CashActor | null,
  today: string
): Promise<{ reversed: number; error?: string }> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return { reversed: 0 };

  const { data: rows, error } = await db
    .from("cash_transactions")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .in("id", unique)
    .overrideTypes<ReversibleRow[]>();
  if (error) return { reversed: 0, error: error.message };

  const { data: done, error: doneError } = await db
    .from("cash_transactions")
    .select("reversal_of")
    .eq("tenant_id", tenantId)
    .in("reversal_of", unique);
  if (doneError) return { reversed: 0, error: doneError.message };
  const already = new Set((done ?? []).map((r) => r.reversal_of as string));

  const todo = (rows ?? []).filter(
    (r) => r.source_type !== "reversal" && !already.has(r.id)
  );
  if (todo.length === 0) return { reversed: 0 };

  const { error: insertError } = await db
    .from("cash_transactions")
    // ⚠️ tenant_id صريح جنب الإضافة — مفتاح الأدمن من غيره بيكتب عند مينيز
    .insert(
      todo.map((r) => ({ ...buildReversal(r, tenantId, actor, today), tenant_id: tenantId }))
    );
  if (insertError) {
    // حد تاني لغاها في نفس اللحظة — النتيجة واحدة
    if (insertError.code === "23505") return { reversed: 0 };
    return { reversed: 0, error: insertError.message };
  }

  // ⚠️ **الأصل بيحفظ اسمه** — بعد مسح المصروف أو الأوردر الربط بيتفضّى، والحركة
  // من غير وصف كانت هتبقى «مصروف» بس في الدفتر.
  for (const r of todo) {
    if (r.description?.trim()) continue;
    await db
      .from("cash_transactions")
      .update({ description: cashRowLabel(r) })
      .eq("tenant_id", tenantId)
      .eq("id", r.id);
  }
  return { reversed: todo.length };
}

/** حركات الخزنة المربوطة بمصروف أو أوردر — اللي هتتلغي قبل مسحه */
export async function cashIdsFor(
  db: SupabaseClient,
  tenantId: string,
  column: "related_expense_id" | "related_order_id",
  ids: string[]
): Promise<{ ids: string[]; error?: string }> {
  if (ids.length === 0) return { ids: [] };
  const { data, error } = await db
    .from("cash_transactions")
    .select("id")
    .eq("tenant_id", tenantId)
    .in(column, ids);
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((r) => r.id as string) };
}
