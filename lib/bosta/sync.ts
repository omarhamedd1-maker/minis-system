// ==========================================================================
// المزامنة كاملة: بتجيب الشحنات من بوسطة، بتطابقها بأوردراتنا، وبتكتب التغييرات
// --------------------------------------------------------------------------
// القرارات كلها في reconcile.ts والمطابقة في match.ts — الملف ده بيوصّلهم
// بقاعدة البيانات بس. وضع التجربة بيعمل كل حاجة من غير ما يكتب.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllDeliveries, type BostaRawDelivery } from "./client";
import { buildIndex, matchDelivery } from "./match";
import { decideSync, type OurOrder } from "./reconcile";

const ORDER_FIELDS = `id, order_number, order_status, delivered_at,
  bosta_state, bosta_exception, bosta_cod, bosta_collected, bosta_tracking,
  bosta_shipping_cost, order_items(quantity, sale_price_at_order),
  customers(full_name)`;

type OrderRow = {
  id: string;
  order_number: string | number | null;
  order_status: string | null;
  delivered_at: string | null;
  bosta_state: string | null;
  bosta_exception: string | null;
  bosta_cod: number | null;
  bosta_collected: boolean | null;
  bosta_tracking: string | null;
  bosta_shipping_cost: number | null;
  order_items: { quantity: number; sale_price_at_order: number }[] | null;
  customers: { full_name: string | null } | null;
};

export type SyncSummary = {
  dry: boolean;
  fetched: number;
  matched: number;
  changed: number;
  statusLocked: number;
  nameMismatch: number;
  unmatched: number;
  errors: string[];
  /** تفاصيل اللي اتغيّر — بنعرضها في وضع التجربة عشان نراجع قبل التنفيذ */
  details: { order: string; reasons: string[] }[];
};

export async function runBostaSync(opts: {
  db: SupabaseClient;
  apiKey: string;
  dry?: boolean;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<SyncSummary> {
  const { db, apiKey, dry = false, now = new Date(), fetchImpl } = opts;

  const summary: SyncSummary = {
    dry,
    fetched: 0,
    matched: 0,
    changed: 0,
    statusLocked: 0,
    nameMismatch: 0,
    unmatched: 0,
    errors: [],
    details: [],
  };

  const deliveries = await fetchAllDeliveries(apiKey, fetchImpl);
  summary.fetched = deliveries.length;

  const { data: orders, error } = await db.from("orders").select(ORDER_FIELDS);
  if (error) throw new Error("معرفناش نقرا الأوردرات: " + error.message);

  const index = buildIndex(
    ((orders ?? []) as unknown as OrderRow[]).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      bosta_tracking: o.bosta_tracking,
      customerName: o.customers?.full_name ?? null,
      row: o,
    }))
  );

  for (const d of deliveries as BostaRawDelivery[]) {
    const m = matchDelivery(d, index);

    if (m.kind === "none") {
      summary.unmatched++;
      continue;
    }
    if (m.kind === "name_mismatch") {
      summary.nameMismatch++;
      continue;
    }

    summary.matched++;
    const row = m.order.row;

    const our: OurOrder = {
      id: row.id,
      order_number: row.order_number,
      order_status: row.order_status,
      delivered_at: row.delivered_at,
      bosta_tracking: row.bosta_tracking,
      bosta_state: row.bosta_state,
      bosta_cod: row.bosta_cod,
      bosta_collected: row.bosta_collected,
      bosta_shipping_cost: row.bosta_shipping_cost,
      bosta_exception: row.bosta_exception,
      productValue: (row.order_items ?? []).reduce(
        (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
        0
      ),
    };

    const decision = decideSync(d, our, now);
    if (decision.statusLocked) summary.statusLocked++;
    if (Object.keys(decision.changes).length === 0) continue;

    summary.changed++;
    summary.details.push({
      order: String(row.order_number),
      reasons: decision.reasons,
    });

    if (!dry) {
      const { error: updateError } = await db
        .from("orders")
        .update(decision.changes)
        .eq("id", row.id);
      if (updateError) {
        summary.errors.push(`أوردر ${row.order_number}: ${updateError.message}`);
      }
    }
  }

  return summary;
}
