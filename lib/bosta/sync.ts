// ==========================================================================
// المزامنة كاملة: بتجيب الشحنات من بوسطة، بتطابقها بأوردراتنا، وبتكتب التغييرات
// --------------------------------------------------------------------------
// القرارات كلها في reconcile.ts والمطابقة في match.ts — الملف ده بيوصّلهم
// بقاعدة البيانات بس. وضع التجربة بيعمل كل حاجة من غير ما يكتب.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAllDeliveries,
  fetchDeliveryByTracking,
  type BostaRawDelivery,
} from "./client";
import {
  isCustomerReturn,
  matchCustomerReturn,
  type ReturnCandidate,
} from "./customer-return";
import { buildIndex, matchDelivery } from "./match";
import { mergeShipments } from "./merge-shipments";
import { decideSync, type OurOrder } from "./reconcile";
import { loadTenantCredentials } from "../tenant-settings";
import { BOSTA_FEES } from "../shipping-cost";
import { orderStatusBadge } from "../format";

const ORDER_FIELDS = `id, order_number, order_status, delivered_at,
  bosta_state, bosta_exception, bosta_cod, bosta_collected, bosta_tracking,
  bosta_shipping_cost, return_tracking,
  order_items(quantity, sale_price_at_order),
  customers(full_name, phone)`;

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
  return_tracking: string | null;
  order_items: { quantity: number; sale_price_at_order: number }[] | null;
  customers: { full_name: string | null; phone: string | null } | null;
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
  /** شحنات مرتجع بعد التسليم اتربطت بأوردراتها */
  customerReturns: number;
  /**
   * شحنات مرتجع مالقيناش لها أوردر واضح — **محتاجة عين بشرية**.
   * مانخمّنش فيها عشان المرتجع بيحرّك بضاعة وفلوس.
   */
  returnsNeedReview: { tracking: string; customer: string; why: string }[];
};

/** الشحنة خلصت خلاص: ٤٥ اتسلّمت، ٤٦ رجعت لنا. دي مش محتاجة تفصيل */
const FINISHED_CODES = [45, 46];

/**
 * بيسجّل تغيير الحالة في سجل الأوردر.
 * التغييرات اليدوية كانت بتتسجّل، أما اللي جاي من بوسطة فكان بيحصل في الصمت —
 * فالأوردر يتغيّر ومحدش يعرف مين غيّره ولا امتى.
 * ورقم الأوردر لازم يبقى في النص لأن السجل بيتفلتر بيه.
 */
async function logStatusChange(
  db: SupabaseClient,
  orderNumber: string | number | null,
  from: string | null,
  to: string
) {
  try {
    await db.from("activity_log").insert({
      actor_id: null,
      actor_name: "المزامنة مع بوسطة",
      action: "order.status",
      summary: `حالة أوردر ${orderNumber ?? ""} بقت ${orderStatusBadge(to).label}${
        from ? ` (كانت ${orderStatusBadge(from).label})` : ""
      }`,
    });
  } catch {
    // الجدول مش موجود أو حصل خطأ؟ المزامنة ماتوقفش عشان سطر سجل
  }
}

/**
 * بيجيب الحالة التفصيلية للشحنة من بوسطة لو لسه شغالة.
 * لو الجلب فشل بنكمّل بالحالة المجمّعة والكود — المزامنة ماتوقفش عشان ده.
 */
async function withDetailedState(
  d: BostaRawDelivery,
  apiKey: string,
  fetchImpl?: typeof fetch
): Promise<BostaRawDelivery> {
  const code = d.state?.code;
  if (typeof code === "number" && FINISHED_CODES.includes(code)) return d;

  const tracking = d.trackingNumber ? String(d.trackingNumber) : "";
  if (!tracking) return d;

  try {
    const detail = await fetchDeliveryByTracking(apiKey, tracking, fetchImpl);
    if (!detail?.state) return d;
    return {
      ...d,
      state: {
        ...(d.state ?? {}),
        value: detail.state,
        code: detail.code ?? d.state?.code ?? null,
      },
      stateIsDetailed: true,
    };
  } catch {
    return d;
  }
}

export async function runBostaSync(opts: {
  db: SupabaseClient;
  /** البيزنس اللي بنزامنه — مفتاحه وأرقامه بتتقرا منه */
  tenantId: string;
  dry?: boolean;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<SyncSummary> {
  const { db, tenantId, dry = false, now = new Date(), fetchImpl } = opts;

  const creds = await loadTenantCredentials(db, tenantId);

  if (!creds.bostaApiKey) {
    throw new Error("البيزنس ده لسه مربطش حساب بوسطة");
  }
  const apiKey = creds.bostaApiKey;
  // رسوم بوسطة واحدة لكل العملاء، فبتفضل في الكود ومتغطية باختبارات
  const rules = BOSTA_FEES;

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
    customerReturns: 0,
    returnsNeedReview: [],
  };

  const deliveries = await fetchAllDeliveries(apiKey, fetchImpl);
  summary.fetched = deliveries.length;

  const { data: orders, error } = await db
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("tenant_id", tenantId);
  if (error) throw new Error("معرفناش نقرا الأوردرات: " + error.message);

  const rows = (orders ?? []) as unknown as OrderRow[];

  const index = buildIndex(
    rows.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      bosta_tracking: o.bosta_tracking,
      customerName: o.customers?.full_name ?? null,
      row: o,
    }))
  );

  // ===== شحنات المرتجع بعد التسليم (نوع ٢٥) =====
  // دي بتتفصل الأول لأنها **مش شحنة توصيل** — مالهاش تحصيل ولا رسوم توصيل،
  // ومعناها إن العميل استلم وبعدين رجّع. لو سيبناها تمشي في مسار التوصيل
  // العادي هتلخبط حالة الأوردر ورسومه.
  const returnCandidates: ReturnCandidate[] = rows.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    order_status: o.order_status,
    customerPhone: o.customers?.phone ?? null,
    customerName: o.customers?.full_name ?? null,
    return_tracking: o.return_tracking,
  }));

  const deliveryShipments: BostaRawDelivery[] = [];

  for (const d of deliveries as BostaRawDelivery[]) {
    if (!isCustomerReturn(d)) {
      deliveryShipments.push(d);
      continue;
    }

    const m = matchCustomerReturn(d, returnCandidates);
    const tracking = d.trackingNumber ? String(d.trackingNumber) : "";
    const who = d.receiver?.fullName ?? "";

    if (m.kind === "none") {
      summary.returnsNeedReview.push({
        tracking,
        customer: who,
        why: "مالقيناش أوردر متسلّم للعميل ده",
      });
      continue;
    }
    if (m.kind === "ambiguous") {
      summary.returnsNeedReview.push({
        tracking,
        customer: who,
        why: `العميل عنده ${m.orders.length} أوردرات متسلّمة — مانعرفش المرتجع بتاع أنهي واحد`,
      });
      continue;
    }

    // الحالة النهائية بتستنى البضاعة توصلنا فعلًا
    const wanted = m.arrived ? "returned_after_delivery" : "returning";
    const changes: Record<string, unknown> = {};
    if (m.order.return_tracking !== tracking && tracking) {
      changes.return_tracking = tracking;
    }
    if (m.order.order_status !== wanted) changes.order_status = wanted;

    if (Object.keys(changes).length === 0) continue;

    summary.customerReturns++;
    summary.details.push({
      order: String(m.order.order_number),
      reasons: [
        m.arrived
          ? `المرتجع وصلك — الحالة بقت مرتجع بعد التسليم (شحنة ${tracking})`
          : `العميل عمل مرتجع — الحالة بقت في الطريق ليك (شحنة ${tracking})`,
      ],
    });

    if (!dry) {
      const { error: retErr } = await db
        .from("orders")
        .update(changes)
        .eq("id", m.order.id);
      if (retErr) {
        summary.errors.push(
          `مرتجع أوردر ${m.order.order_number}: ${retErr.message}`
        );
      } else if (typeof changes.order_status === "string") {
        await logStatusChange(
          db,
          m.order.order_number,
          m.order.order_status,
          changes.order_status
        );
      }
    }
  }

  // بنجمّع شحنات كل أوردر الأول، وبعدين نقرر مرة واحدة —
  // عشان الأوردر اللي ليه أكتر من شحنة تتحسب رسومه وتحصيله صح
  const byOrder = new Map<
    string,
    { row: OrderRow; deliveries: BostaRawDelivery[] }
  >();

  for (const d of deliveryShipments) {
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
    const bucket = byOrder.get(row.id);
    if (bucket) bucket.deliveries.push(d);
    else byOrder.set(row.id, { row, deliveries: [d] });
  }

  for (const { row, deliveries: shipments } of byOrder.values()) {
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

    const merged = mergeShipments(
      shipments,
      our.productValue,
      our.order_status,
      rules
    )!;

    // الحالة اللي بتجي في المزامنة مجمّعة: "Processing" بتشمل الشحنة اللي في
    // المخزن واللي في الطريق واللي عند المندوب. فللشحنات اللي **لسه ماخلصتش**
    // بنجيب حالتها التفصيلية من بوسطة — دول عدد صغير فالتكلفة رخيصة، والنتيجة
    // إن الحالة عندنا تبقى نفس اللي بوسطة بتعرضه بالظبط.
    const latest = await withDetailedState(merged.latest, apiKey, fetchImpl);

    // شحنة واحدة؟ نمشي بالحسبة العادية. أكتر من واحدة؟ نبعت المجاميع
    const decision = decideSync(
      latest,
      our,
      now,
      rules,
      merged.count > 1
        ? { cod: merged.totalCod, fee: merged.totalFee }
        : undefined
    );

    if (decision.statusLocked) summary.statusLocked++;
    if (Object.keys(decision.changes).length === 0) continue;

    summary.changed++;
    summary.details.push({
      order: String(row.order_number),
      reasons:
        merged.count > 1
          ? [...decision.reasons, `(${merged.count} شحنات لنفس الأوردر)`]
          : decision.reasons,
    });

    if (!dry) {
      const { error: updateError } = await db
        .from("orders")
        .update(decision.changes)
        .eq("id", row.id);
      if (updateError) {
        summary.errors.push(`أوردر ${row.order_number}: ${updateError.message}`);
      } else if (typeof decision.changes.order_status === "string") {
        await logStatusChange(
          db,
          row.order_number,
          row.order_status,
          decision.changes.order_status
        );
      }
    }
  }

  return summary;
}
