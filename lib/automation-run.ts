// ==========================================================================
// تشغيل قواعد الأتمتة — بيجمع الحقايق وبيبعت اللي عدّى الحد
// --------------------------------------------------------------------------
// ⚠️⚠️ **بينبّه بس.** مافيش تعديل ولا إلغاء ولا رسايل للعملاء — النتيجة
// الوحيدة إشعار.
//
// ⚠️ **والبيزنس اللي مالوش قواعد بيتعدّى من غير أي استعلام** — القراية
// بتحصل بعد ما نعرف إن فيه قاعدة محتاجاها فعلًا.
//
// ⚠️ **ومنع التكرار في `notifyAll`** (`notification_log`) — التاج بالقاعدة
// والحالة، فالأوردر بيتقال عليه مرة وخلاص.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runRules,
  hitMessage,
  hitTag,
  type Rule,
  type Fact,
  type Trigger,
  TRIGGERS,
  hitHref,
} from "./automation";

/** النوع ده معروف؟ */
function isTrigger(value: string): value is Trigger {
  return Object.prototype.hasOwnProperty.call(TRIGGERS, value);
}
import { notifyAll } from "./push/notify";

/** الحالات اللي لسه ينفع تتصرّف فيها قبل الشحن */
const BEFORE_SHIPPING = ["confirmed", "packed"];
const IN_TRANSIT = ["shipped", "out_for_delivery", "awaiting_action"];

function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 86_400_000;
}

type OrderRow = {
  id: string;
  order_number: string | null;
  order_status: string | null;
  order_date: string | null;
  discount: number | null;
  shipping_price: number | null;
  bosta_tracking: string | null;
  bosta_created_at: string | null;
  bosta_cod: number | null;
  customers: { full_name: string | null } | null;
  order_items: { quantity: number; sale_price_at_order: number }[];
};

type VariantRow = {
  id: string;
  variant_name: string | null;
  quantity_on_hand: number | null;
  products: { name: string | null; name_ar: string | null } | null;
};

/** الأنواع اللي محتاجة أوردرات عشان تتقاس */
const ORDER_TRIGGERS: Trigger[] = [
  "order_waiting",
  "order_not_shipped",
  "shipment_stuck",
  "big_order",
  "cod_gap",
];

/**
 * بيجمع الحقايق اللي القواعد محتاجاها — **واللي مش محتاجة مابيتقاسش**.
 */
export async function collectFacts(
  db: SupabaseClient,
  tenantId: string,
  wanted: Set<Trigger>,
  now: Date
): Promise<Fact[]> {
  const facts: Fact[] = [];

  if (ORDER_TRIGGERS.some((t) => wanted.has(t))) {
    const { data } = await db
      .from("orders")
      .select(
        `id, order_number, order_status, order_date, discount, shipping_price,
         bosta_tracking, bosta_created_at, bosta_cod,
         customers(full_name), order_items(quantity, sale_price_at_order)`
      )
      .eq("tenant_id", tenantId)
      .eq("archived", false)
      .in("order_status", ["new", ...BEFORE_SHIPPING, ...IN_TRANSIT])
      .limit(1000)
      .overrideTypes<OrderRow[]>();

    for (const o of data ?? []) {
      const label = `#${o.order_number ?? "؟"} ${o.customers?.full_name ?? ""}`.trim();
      const status = String(o.order_status);
      const total =
        (o.order_items ?? []).reduce(
          (s, i) => s + Number(i.quantity) * Number(i.sale_price_at_order),
          0
        ) -
        Number(o.discount ?? 0) +
        Number(o.shipping_price ?? 0);

      const age = daysSince(o.order_date, now);

      if (wanted.has("order_waiting") && status === "new" && age !== null) {
        facts.push({ trigger: "order_waiting", subjectId: o.id, label, value: age });
      }

      if (
        wanted.has("order_not_shipped") &&
        BEFORE_SHIPPING.includes(status) &&
        !String(o.bosta_tracking ?? "").trim() &&
        age !== null
      ) {
        facts.push({
          trigger: "order_not_shipped",
          subjectId: o.id,
          label,
          value: age,
        });
      }

      if (wanted.has("shipment_stuck") && IN_TRANSIT.includes(status)) {
        // ⚠️ مافيش عمود بيسجّل آخر حركة، فبنستخدم تاريخ الشحنة كتقريب —
        // النتيجة إن المدة بتبان **أطول**، يعني التنبيه بيرن أبكر شوية
        const moved = daysSince(o.bosta_created_at, now);
        if (moved !== null) {
          facts.push({
            trigger: "shipment_stuck",
            subjectId: o.id,
            label,
            value: moved,
          });
        }
      }

      if (wanted.has("big_order") && total > 0) {
        facts.push({ trigger: "big_order", subjectId: o.id, label, value: total });
      }

      if (wanted.has("cod_gap")) {
        const bosta = Number(o.bosta_cod ?? 0);
        // ⚠️ الشحنة اللي مالهاش تحصيل مش فرق — دي مدفوعة أو مالهاش رقم
        if (bosta > 0 && total > 0) {
          const gap = Math.abs(bosta - total);
          if (gap > 0) {
            facts.push({ trigger: "cod_gap", subjectId: o.id, label, value: gap });
          }
        }
      }
    }
  }

  if (wanted.has("stock_low")) {
    const { data } = await db
      .from("product_variants")
      .select("id, variant_name, quantity_on_hand, products(name, name_ar)")
      .eq("tenant_id", tenantId)
      .limit(1000)
      .overrideTypes<VariantRow[]>();

    for (const v of data ?? []) {
      const qty = Number(v.quantity_on_hand ?? 0);
      // ⚠️⚠️ **الصفر بيتشال بقصد** — ٨٩ شكل من ١٠١ مخزونهم مكتوب صفر عند
      // عمر، ودول **مش متسجّلين** مش خلصانين. تنبيه عليهم كان هيبقى ٨٩
      // إشعار في أول لفة، والقاعدة تتقفل من يومها.
      //
      // (والمقارنة نفسها بالعكس — `DIRECTION` في `lib/automation.ts`.)
      if (qty > 0) {
        facts.push({
          trigger: "stock_low",
          subjectId: v.id,
          label:
            [v.products?.name_ar ?? v.products?.name, v.variant_name]
              .filter(Boolean)
              .join(" · ") || "شكل",
          value: qty,
        });
      }
    }
  }

  return facts;
}

export type RunResult = {
  rules: number;
  hits: number;
  sent: number;
};

/**
 * بيشغّل قواعد البيزنس.
 *
 * ⚠️ **الجدول لو مش موجود، الدالة بتسكت** — البيزنس اللي لسه مااتعملش
 * عنده الجدول مش عطل.
 */
export async function runAutomation(opts: {
  db: SupabaseClient;
  tenantId: string;
  now: Date;
  dry: boolean;
}): Promise<RunResult> {
  const { db, tenantId, now, dry } = opts;

  const { data, error } = await db
    .from("automation_rules")
    .select("id, trigger, threshold, active")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .limit(50);

  if (error) return { rules: 0, hits: 0, sent: 0 };

  // ⚠️ **النوع اللي مش معروف بيتشال** — قاعدة قديمة لنوع اتشال من الكود
  // مالهاش معنى، و`runRules` هتتخطاها بس الأحسن ماتوصلهاش أصلًا.
  const rules: Rule[] = (
    (data ?? []) as {
      id: string;
      trigger: string;
      threshold: number;
      active: boolean;
    }[]
  )
    .filter((r) => isTrigger(r.trigger))
    .map((r) => ({
      id: r.id,
      trigger: r.trigger as Trigger,
      threshold: Number(r.threshold),
      active: r.active,
    }));

  if (rules.length === 0) return { rules: 0, hits: 0, sent: 0 };

  const wanted = new Set(rules.map((r) => r.trigger));
  const facts = await collectFacts(db, tenantId, wanted, now);
  const hits = runRules(rules, facts);

  if (dry) return { rules: rules.length, hits: hits.length, sent: 0 };

  let sent = 0;
  // ⚠️ **سقف على البعتة الواحدة** — قاعدة بحد صغير على متجر كبير ممكن
  // تطلّع ٣٠٠ تنبيه في لفة واحدة. المنع بالتاج بيمنع التكرار، بس الدفعة
  // الأولى نفسها لازم يكون ليها حد.
  for (const hit of hits.slice(0, 20)) {
    await notifyAll(db, tenantId, hitMessage(hit), {
      tag: hitTag(hit),
      url: hitHref(hit.trigger, hit.subjectId),
    });
    sent++;
  }

  return { rules: rules.length, hits: hits.length, sent };
}
