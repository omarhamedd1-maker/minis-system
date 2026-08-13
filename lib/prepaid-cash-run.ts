// ==========================================================================
// تسجيل الفلوس المقدمة في الخزنة
// --------------------------------------------------------------------------
// القرار كله في `lib/prepaid-cash.ts` (دوال صافية). الملف ده بيوصّله
// بقاعدة البيانات بس.
//
// **بيشتغل مع الشغل الدوري كل ربع ساعة.** والنداء مية مرة نتيجته زي المرة
// الواحدة: السطر المتسجّل بيبقى مربوط بالأوردر، والمربوط مابيتلمسش.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planPrepaidCash,
  prepaidDescription,
  type CashRow,
  type PrepaidOrder,
} from "./prepaid-cash";

export type PrepaidRunResult = {
  added: number;
  adopted: number;
  alreadyDone: number;
  /** وقفنا عندها ومستنية عمر — سطر بنفس المبلغ برقم أوردر تاني */
  review: {
    orderNumber: string | null;
    amount: number;
    cashDescription: string | null;
  }[];
  /** في وضع العرض: اللي كان هيتسجّل */
  preview: { orderNumber: string | null; amount: number; description: string }[];
};

export async function recordPrepaidCash(opts: {
  db: SupabaseClient;
  tenantId: string;
  /** يعرض من غير ما يكتب — نفس قاعدة `?dry=1` في السيستم كله */
  dry?: boolean;
}): Promise<PrepaidRunResult> {
  const { db, tenantId, dry } = opts;
  const out: PrepaidRunResult = {
    added: 0,
    adopted: 0,
    alreadyDone: 0,
    review: [],
    preview: [],
  };

  // **الملغي مستثنى** — فلوسه رجعت أو عمرها ما وصلت
  const { data: orderRows, error } = await db
    .from("orders")
    .select("id, order_number, amount_paid, payment_method, order_date")
    .eq("tenant_id", tenantId)
    .gt("amount_paid", 0)
    .neq("order_status", "cancelled")
    .limit(2000);

  if (error || !orderRows) return out;

  const orders: PrepaidOrder[] = (
    orderRows as {
      id: string;
      order_number: string | null;
      amount_paid: number | null;
      payment_method: string | null;
      order_date: string | null;
    }[]
  ).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    amountPaid: Number(o.amount_paid ?? 0),
    paymentMethod: o.payment_method,
    orderDate: o.order_date,
  }));

  if (orders.length === 0) return out;

  const { data: cashRows } = await db
    .from("cash_transactions")
    .select("id, direction, amount, description, related_order_id, transaction_date")
    .eq("tenant_id", tenantId)
    .limit(5000);

  const cash: CashRow[] = (
    (cashRows ?? []) as {
      id: string;
      direction: string | null;
      amount: number;
      description: string | null;
      related_order_id: string | null;
    }[]
  ).map((c) => ({
    id: c.id,
    direction: c.direction,
    amount: Number(c.amount ?? 0),
    description: c.description,
    relatedOrderId: c.related_order_id,
  }));

  // **أقدم حركة في الخزنة = الرصيد الافتتاحي.** أي أوردر قبلها فلوسه
  // جوّاه خلاص، وتسجيله تاني بيعدّه مرتين
  const dates = ((cashRows ?? []) as { transaction_date: string | null }[])
    .map((c) => String(c.transaction_date ?? "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const cashStartsOn = dates[0] ?? null;

  const plan = planPrepaidCash(orders, cash, cashStartsOn);
  out.alreadyDone = plan.alreadyDone;
  out.review = plan.needsReview.map((r) => ({
    orderNumber: r.order.orderNumber,
    amount: r.amount,
    cashDescription: r.cashDescription,
  }));
  out.preview = plan.toAdd.map(({ order, amount }) => ({
    orderNumber: order.orderNumber,
    amount,
    description: prepaidDescription(order),
  }));

  if (dry) {
    out.added = plan.toAdd.length;
    out.adopted = plan.toAdopt.length;
    return out;
  }

  // **الربط الأول** — السطر اللي عمر كاتبه بياخد رقم الأوردر بس، من غير
  // ما مبلغه ولا وصفه يتغيّر
  for (const { order, cashId } of plan.toAdopt) {
    const { error: e } = await db
      .from("cash_transactions")
      .update({ related_order_id: order.id })
      .eq("tenant_id", tenantId)
      .eq("id", cashId);
    if (!e) out.adopted++;
  }

  for (const { order, amount } of plan.toAdd) {
    const { error: e } = await db.from("cash_transactions").insert({
      tenant_id: tenantId,
      direction: "in",
      amount,
      source_type: "prepaid",
      related_order_id: order.id,
      description: prepaidDescription(order),
      transaction_date: order.orderDate ?? new Date().toISOString().slice(0, 10),
    });
    if (!e) out.added++;
  }

  return out;
}
