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
  pickReturnShipment,
  returnArrived,
  returnDead,
  type ReturnCandidate,
} from "./customer-return";
import { newFailedAttempt } from "./exception";
import { buildIndex, matchDelivery } from "./match";
import { mergeShipments } from "./merge-shipments";
import { decideSync, type OurOrder } from "./reconcile";
import { loadTenantCredentials } from "../tenant-settings";
import { BOSTA_FEES } from "../shipping-cost";
import { orderStatusBadge } from "../format";
import { failedDeliveryMessage } from "../alert-messages";
import { notifyAll } from "../push/notify";
import { checkStalePickup, stalePickupMessage } from "./stale-shipment";
import { checkCod, codMismatchMessage } from "./cod-check";
import { checkRefundDue, refundDue, refundReminderMessage } from "../refund";
import {
  GROUP_ABOVE,
  checkUnconfirmed,
  unconfirmedGroupMessage,
  unconfirmedMessage,
} from "../unconfirmed";

const ORDER_FIELDS = `id, order_number, order_status, delivered_at,
  bosta_state, bosta_exception, bosta_cod, bosta_collected, bosta_tracking,
  bosta_shipping_cost, return_tracking, bosta_created_at, bosta_stale_alerted_day, cod_alerted_diff, cod_diff_ignored,
  shipping_price, discount,
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
  bosta_created_at: string | null;
  bosta_stale_alerted_day: number | null;
  cod_alerted_diff: number | null;
  cod_diff_ignored: boolean | null;
  shipping_price: number | null;
  discount: number | null;
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
  /** تنبيهات فرق التحصيل بينّا وبين بوسطة */
  codMismatches: number;
  /** تنبيهات "أوردر لسه مش مؤكد" */
  unconfirmedReminders: number;
  /** تنبيهات "لسه مارجّعتش فلوس العميل" */
  refundReminders: number;
  /** شحنات واقفة نبّهنا عليها */
  stalePickups: number;
  /** شحنات مرتجع بعد التسليم اتربطت بأوردراتها */
  customerReturns: number;
  /**
   * شحنات مرتجع مالقيناش لها أوردر واضح — **محتاجة عين بشرية**.
   * مانخمّنش فيها عشان المرتجع بيحرّك بضاعة وفلوس.
   */
  returnsNeedReview: { tracking: string; customer: string; why: string }[];
};

/**
 * الحالات اللي بتبعت تنبيه فوري على الموبايل.
 * دي اللحظة اللي فيها بضاعة راجعة وفلوس ماوصلتش — ولازم حد يتحرك.
 *
 * ودي مش الطريق الوحيد للتنبيه: أول محاولة فاشلة بتنبّه كمان حتى لو حالة
 * الأوردر لسه ماتغيّرتش (`newFailedAttempt`).
 */
const ALERT_ON = ["returning", "returned", "awaiting_action"];

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
  to: string,
  orderId?: string
) {
  const row = {
    actor_id: null,
    actor_name: "المزامنة مع بوسطة",
    action: "order.status",
    summary: `حالة أوردر ${orderNumber ?? ""} بقت ${orderStatusBadge(to).label}${
      from ? ` (كانت ${orderStatusBadge(from).label})` : ""
    }`,
  };
  const log = db.from("activity_log");
  try {
    // بنربطه بالأوردر نفسه — التجميع بالنص كان بيلقّط أوردرات تانية
    const { error } = await log.insert(
      (orderId ? { ...row, order_id: orderId } : row) as never
    );
    // الخانة لسه مااتعملتش؟ نكتب من غيرها بدل ما السطر يضيع
    if (error && orderId) await log.insert(row as never);
  } catch {
    // الجدول مش موجود أو حصل خطأ؟ المزامنة ماتوقفش عشان سطر سجل
  }
}

/** سطر سجل من المزامنة — بيفشل بهدوء ويجرّب من غير order_id لو الخانة ناقصة */
async function logActivityRow(
  db: SupabaseClient,
  entry: { action: string; summary: string; orderId?: string }
) {
  const row = {
    actor_id: null,
    actor_name: "المزامنة مع بوسطة",
    action: entry.action,
    summary: entry.summary,
  };
  const log = db.from("activity_log");
  try {
    const { error } = await log.insert(
      (entry.orderId ? { ...row, order_id: entry.orderId } : row) as never
    );
    if (error && entry.orderId) await log.insert(row as never);
  } catch {
    // السجل مش أهم من المزامنة
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
    stalePickups: 0,
    refundReminders: 0,
    unconfirmedReminders: 0,
    codMismatches: 0,
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

  // **شحنات المرتجع بتتجمّع لكل أوردر الأول والقرار بيتاخد مرة واحدة.**
  // الأوردر ممكن يبقى عليه أكتر من شحنة مرتجع (واحدة اتلغت وواحدة وصلت)،
  // ولو مشينا شحنة شحنة بتبقى آخر واحدة اتقرت هي اللي تكسب — وده اللي جمّد
  // أوردر ١٠٨١ على شحنة ملغية.
  const returnsByOrder = new Map<
    string,
    { order: ReturnCandidate; shipments: BostaRawDelivery[] }
  >();

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

    const bucket = returnsByOrder.get(m.order.id);
    if (bucket) bucket.shipments.push(d);
    else returnsByOrder.set(m.order.id, { order: m.order, shipments: [d] });
  }

  for (const { order, shipments } of returnsByOrder.values()) {
    const best = pickReturnShipment(shipments);
    if (!best) continue;

    const tracking = best.trackingNumber ? String(best.trackingNumber) : "";

    // كل شحنات المرتجع اللي على الأوردر ده ملغية — مش هتيجي حاجة.
    // مانحرّكش الحالة على شحنة ميتة، وننبّه بس لو الأوردر واقف عليها فعلًا.
    if (returnDead(best)) {
      if (order.return_tracking === tracking || order.order_status === "returning") {
        summary.returnsNeedReview.push({
          tracking,
          customer: order.customerName ?? "",
          why: `أوردر ${order.order_number}: شحنة المرتجع اتلغت عند بوسطة والأوردر واقف مستنيها`,
        });
      }
      continue;
    }

    // الحالة النهائية بتستنى البضاعة توصلنا فعلًا
    const arrived = returnArrived(best);
    const wanted = arrived ? "returned_after_delivery" : "returning";
    const changes: Record<string, unknown> = {};
    if (order.return_tracking !== tracking && tracking) {
      changes.return_tracking = tracking;
    }
    if (order.order_status !== wanted) changes.order_status = wanted;

    if (Object.keys(changes).length === 0) continue;

    summary.customerReturns++;
    summary.details.push({
      order: String(order.order_number),
      reasons: [
        arrived
          ? `المرتجع وصلك — الحالة بقت مرتجع بعد التسليم (شحنة ${tracking})`
          : `العميل عمل مرتجع — الحالة بقت في الطريق ليك (شحنة ${tracking})`,
      ],
    });

    if (!dry) {
      const { error: retErr } = await db
        .from("orders")
        .update(changes)
        .eq("id", order.id);
      if (retErr) {
        summary.errors.push(
          `مرتجع أوردر ${order.order_number}: ${retErr.message}`
        );
      } else if (typeof changes.order_status === "string") {
        await logStatusChange(
          db,
          order.order_number,
          order.order_status,
          changes.order_status,
          order.id
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
      bosta_created_at: row.bosta_created_at,
      // عليه شحنة مرتجع؟ المرتجع هو اللي بيحدد الحالة مش الشحنة الأصلية
      hasCustomerReturn: Boolean(row.return_tracking),
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

    // ===== فرق التحصيل =====
    // السيستم بيدفع التحصيل لبوسطة بس لما تعدّل من الشاشة. لو الرقم اختلف
    // لأي سبب تاني مفيش حاجة بتكتشف — والفحص لقى ١٥ أوردر بفرق ١٨ ألف جنيه.
    // **بننبّه بس مانصلّحش** — أحيانًا الاتنين صح (شحنة جزئية).
    if (!dry && !row.cod_diff_ignored) {
      const ourCod = Math.max(
        0,
        (row.order_items ?? []).reduce(
          (a, i) => a + Number(i.quantity) * Number(i.sale_price_at_order),
          0
        ) -
          Number(row.discount ?? 0) +
          Number(row.shipping_price ?? 0)
      );
      const c = checkCod({
        orderStatus: row.order_status,
        ours: ourCod,
        bosta: merged.latest.cod ?? null,
        codUpdateBlocked: null,
        alertedAmount: row.cod_alerted_diff,
      });

      if (c.alert) {
        summary.codMismatches++;
        await notifyAll(
          db,
          tenantId,
          codMismatchMessage({
            orderNumber: row.order_number,
            customerName: row.customers?.full_name ?? null,
            ours: ourCod,
            bosta: Number(merged.latest.cod ?? 0),
            fixable: c.fixable,
            siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
          }),
          { fetchImpl, tag: "cod-" + row.id, url: "/orders/" + row.id }
        );
        await db
          .from("orders")
          .update({ cod_alerted_diff: c.diff })
          .eq("id", row.id);
        await logActivityRow(db, {
          action: "bosta.cod_diff",
          summary: `فرق تحصيل أوردر ${row.order_number ?? ""}: عندنا ${ourCod} وبوسطة ${merged.latest.cod}`,
          orderId: row.id,
        });
      }
    }

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
      } else {
        // ===== سجل رحلة الشحنة =====
        // حالة بوسطة التفصيلية بتتغيّر أكتر من حالتنا: "استلمها الفرع" ←
        // "بين الفروع" ← "خرجت للتسليم" كلهم عندنا "مع المندوب". فلو سجّلنا
        // حالتنا بس، الرحلة بتضيع. بنسجّل الاتنين — بوسطة الأول لأنها الأدق.
        if (typeof decision.changes.bosta_state === "string") {
          await logActivityRow(db, {
            action: "bosta.state",
            summary: `شحنة أوردر ${row.order_number ?? ""} عند بوسطة: ${
              decision.changes.bosta_state
            }${row.bosta_state ? ` (كانت ${row.bosta_state})` : ""}`,
            orderId: row.id,
          });
        }

        const to =
          typeof decision.changes.order_status === "string"
            ? decision.changes.order_status
            : null;

        if (to) {
          await logStatusChange(db, row.order_number, row.order_status, to, row.id);
        }

        // ===== أهم تنبيه في السيستم: العميل مستلمش =====
        //
        // **بيروح من أول محاولة فاشلة، مش لما الأوردر يرجع خلاص.** بوسطة
        // بتحاول أكتر من مرة على مدى أيام قبل ما تبدأ ترجّع الشحنة، وقبل
        // كده كان التنبيه مربوط بتغيير حالة الأوردر بس — يعني كان بيوصلك
        // بعد ما الشحنة تكون بقت راجعة والفرصة تكون ضاعت. دلوقتي أول ما
        // بوسطة تقول "العميل رفض" أو "مش بيرد" التنبيه بيوصل في وقته
        // وإنت لسه تقدر تكلّم العميل وتنقذ الأوردر.
        //
        // والحالة اللي بتوصل لـ"راجع" أو "مستنية قرار" بتنبّه برضه — دي
        // أخبار تانية غير المحاولة الفاشلة.
        const attempt = newFailedAttempt(
          row.bosta_exception,
          decision.changes.bosta_exception as string | null | undefined
        );
        const settled = to === "cancelled" || row.order_status === "cancelled";

        if ((attempt || (to && ALERT_ON.includes(to))) && !settled) {
          await notifyAll(
            db,
            tenantId,
            failedDeliveryMessage({
              orderNumber: row.order_number,
              customerName: row.customers?.full_name ?? null,
              customerPhone: row.customers?.phone ?? null,
              reason: (decision.changes.bosta_exception ??
                row.bosta_exception) as string | null,
              arrived: to === "returned",
              waiting: to === "awaiting_action",
              siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
            }),
            {
              fetchImpl,
              // **تاج لكل أوردر لوحده.** كان `order-` ثابت للكل، يعني لو
              // تلات أوردرات وقعوا في نفس المزامنة، الإشعار الأخير كان
              // بيمسح اللي قبله من على الشاشة ومحدش ياخد باله.
              tag: `order-${row.id}`,
              url: `/orders/${row.id}`,
            }
          );
        }
      }
    }
  }

  // ===== الشحنات الواقفة: المندوب مجاش ياخدها =====
  // بنقرا من جديد بعد التحديثات عشان الحالات تبقى أحدث حاجة. ودي مسألة
  // وقاية: لو الشحنة قعدت أسبوعين بوسطة بتأرشفها وخلاص مفيش رجعة —
  // فبننبّه بعد ٣ أيام وإنت لسه تقدر تكلّمهم.
  if (!dry) {
    const { data: waiting } = await db
      .from("orders")
      .select(
        "id, order_number, order_status, bosta_tracking, bosta_created_at, bosta_stale_alerted_day, customers(full_name)"
      )
      .eq("tenant_id", tenantId)
      .eq("archived", false)
      .not("bosta_created_at", "is", null);

    for (const w of (waiting ?? []) as unknown as {
      id: string;
      order_number: string | number | null;
      order_status: string | null;
      bosta_tracking: string | null;
      bosta_created_at: string | null;
      bosta_stale_alerted_day: number | null;
      customers: { full_name: string | null } | null;
    }[]) {
      const stale = checkStalePickup({
        createdAt: w.bosta_created_at,
        orderStatus: w.order_status,
        alertedDay: w.bosta_stale_alerted_day,
        now,
      });
      if (stale.milestone === null) continue;

      summary.stalePickups++;
      await notifyAll(
        db,
        tenantId,
        stalePickupMessage({
          orderNumber: w.order_number,
          customerName: w.customers?.full_name ?? null,
          days: stale.days,
          milestone: stale.milestone,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
        }),
        { fetchImpl, tag: "stale-" + w.id, url: "/orders?status=ready" }
      );

      // بنعلّم إننا نبّهنا **بعد** الإرسال — لو الإرسال وقع نحاول تاني
      // المرة الجاية بدل ما التنبيه يضيع خالص
      await db
        .from("orders")
        .update({ bosta_stale_alerted_day: stale.milestone })
        .eq("id", w.id);

      await logActivityRow(db, {
        action: "bosta.stale",
        summary: `شحنة أوردر ${w.order_number ?? ""} قاعدة ${stale.days} يوم من غير بيك اب (مرحلة ${stale.milestone})`,
        orderId: w.id,
      });
    }

    // ===== فلوس المرتجع: لسه مارجّعناش للعميل =====
    // بوسطة مابتدفعش للعميل — عمر اللي بيحوّله. والحوالة دي مالهاش أثر في
    // السيستم، فبنفضل ننبّه لحد ما يأكّد. تاريخ البداية هو آخر مرة الحالة
    // بقت "مرتجع بعد التسليم" في السجل، وإلا تاريخ التسليم.
    const { data: owing } = await db
      .from("orders")
      .select(
        "id, order_number, order_status, delivered_at, refunded_at, refund_reminded_day, order_items(returned_quantity, sale_price_at_order), customers(full_name, phone)"
      )
      .eq("tenant_id", tenantId)
      .eq("order_status", "returned_after_delivery")
      .is("refunded_at", null);

    for (const o of (owing ?? []) as unknown as {
      id: string;
      order_number: string | number | null;
      order_status: string | null;
      delivered_at: string | null;
      refunded_at: string | null;
      refund_reminded_day: number | null;
      order_items: { returned_quantity: number | null; sale_price_at_order: number }[] | null;
      customers: { full_name: string | null; phone: string | null } | null;
    }[]) {
      const amount = refundDue(
        (o.order_items ?? []).map((i) => ({
          returnedQuantity: i.returned_quantity,
          salePriceAtOrder: i.sale_price_at_order,
        }))
      );

      const due = checkRefundDue({
        orderStatus: o.order_status,
        returnedAt: o.delivered_at,
        refundedAt: o.refunded_at,
        amountDue: amount,
        remindedDay: o.refund_reminded_day,
        now,
      });
      if (due.milestone === null) continue;

      summary.refundReminders++;
      await notifyAll(
        db,
        tenantId,
        refundReminderMessage({
          orderNumber: o.order_number,
          customerName: o.customers?.full_name ?? null,
          customerPhone: o.customers?.phone ?? null,
          amount,
          days: due.days,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
        }),
        { fetchImpl, tag: "refund-" + o.id, url: "/orders?status=returned_after_delivery" }
      );

      await db
        .from("orders")
        .update({ refund_reminded_day: due.milestone })
        .eq("id", o.id);
    }

    // ===== أوردرات لسه "جديد" ومحدش أكّدها =====
    // تنبيه **يومي** (مش مراحل) لحد ما تتأكّد. البضاعة محجوزة والعميل مستني.
    const { data: unconfirmed } = await db
      .from("orders")
      .select(
        "id, order_number, order_status, order_date, new_reminded_day, order_items(quantity, sale_price_at_order), customers(full_name, phone)"
      )
      .eq("tenant_id", tenantId)
      .eq("archived", false)
      .eq("order_status", "new");

    type Unconf = {
      id: string;
      order_number: string | number | null;
      order_status: string | null;
      order_date: string | null;
      new_reminded_day: number | null;
      order_items: { quantity: number; sale_price_at_order: number }[] | null;
      customers: { full_name: string | null; phone: string | null } | null;
    };

    const dueNow: { order: Unconf; days: number; day: number }[] = [];

    for (const o of (unconfirmed ?? []) as unknown as Unconf[]) {
      const c = checkUnconfirmed({
        orderStatus: o.order_status,
        orderDate: o.order_date,
        remindedDay: o.new_reminded_day,
        now,
      });
      if (c.day === null) continue;
      dueNow.push({ order: o, days: c.days, day: c.day });
    }

    if (dueNow.length > 0) {
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? null;
      summary.unconfirmedReminders += dueNow.length;

      // أكتر من ٥؟ رسالة واحدة بالعدد. ٦ رسايل في نفس اللحظة بتبقى إزعاج
      // ومحدش بيقراها.
      if (dueNow.length > GROUP_ABOVE) {
        await notifyAll(
          db,
          tenantId,
          unconfirmedGroupMessage({
            count: dueNow.length,
            oldestDays: Math.max(...dueNow.map((x) => x.days)),
            siteUrl: site,
          }),
          { fetchImpl, tag: "unconfirmed-group", url: "/orders?status=new" }
        );
      } else {
        for (const x of dueNow) {
          await notifyAll(
            db,
            tenantId,
            unconfirmedMessage({
              orderNumber: x.order.order_number,
              customerName: x.order.customers?.full_name ?? null,
              customerPhone: x.order.customers?.phone ?? null,
              total: (x.order.order_items ?? []).reduce(
                (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
                0
              ),
              days: x.days,
              siteUrl: site,
            }),
            { fetchImpl, tag: "new-" + x.order.id, url: "/orders?status=new" }
          );
        }
      }

      // بنعلّم على الكل — حتى في الحالة المجمّعة، عشان بكرة يتنبّه تاني بس
      // مش النهاردة كل ١٥ دقيقة
      for (const x of dueNow) {
        await db
          .from("orders")
          .update({ new_reminded_day: x.day })
          .eq("id", x.order.id);
      }
    }
  }

  return summary;
}
