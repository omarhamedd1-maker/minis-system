// ==========================================================================
// تنفيذ مزامنة تعديل الأوردر
// --------------------------------------------------------------------------
// القرار كله في `order-resync.ts` (دالة صافية). الملف ده بيوصّله بقاعدة
// البيانات وبشوبيفاي.
//
// ⚠️⚠️ **بيتنادى بضغطة بس** — مافيش لفة دورية بتعدّل بنود أوردرات لوحدها.
// التحديث التلقائي بيمسح تعديلات الموظفين من ورا ظهرهم.
//
// ⚠️ **والمخزون بيتصلّح مع البنود.** لو البنود اتغيّرت والمخزون ماتغيّرش،
// الرقم بيفضل غلط للأبد ومحدش يلاقي السبب.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchShopifyOrders } from "./orders";
import { resolveShopifyToken } from "./token";
import { planResync, resyncSummary, type ResyncPlan } from "./order-resync";
import { allRows } from "../fetch-all-pages";

export type ResyncResult =
  | { ok: true; summary: string; before: number; after: number }
  | { ok: false; error: string };

/**
 * بيرجّع الأوردر زي ما هو عند شوبيفاي.
 *
 * ⚠️ **بيقرا شوبيفاي وقت النداء** — مش بيعتمد على نسخة محفوظة، عشان
 * اللي بيدوس يبقى شايف آخر حاجة فعلًا.
 */
export async function resyncOrder(opts: {
  db: SupabaseClient;
  tenantId: string;
  orderId: string;
  /** يعرض من غير ما يكتب */
  dry?: boolean;
}): Promise<ResyncResult> {
  const { db, tenantId, orderId, dry = false } = opts;

  const { data: row, error } = await db
    .from("orders")
    .select(
      `id, order_number, order_status, bosta_tracking, discount, shipping_price,
       order_items(id, variant_id, quantity, sale_price_at_order)`
    )
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();

  if (error || !row) return { ok: false, error: "الأوردر ده مش موجود" };

  const ours = row as unknown as {
    id: string;
    order_number: string | null;
    order_status: string | null;
    bosta_tracking: string | null;
    discount: number | null;
    shipping_price: number | null;
    order_items: {
      id: string;
      variant_id: string | null;
      quantity: number;
      sale_price_at_order: number;
    }[];
  };

  const auth = await resolveShopifyToken(db, tenantId);
  if (!auth.ok) return { ok: false, error: auth.error };

  let shopifyOrders;
  try {
    shopifyOrders = await fetchShopifyOrders(auth.shop, auth.token);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "معرفناش نوصل لشوبيفاي",
    };
  }

  const num = String(ours.order_number ?? "").trim();
  const theirs = shopifyOrders.find(
    (o) => String(o.orderNumber).trim() === num
  );
  if (!theirs) {
    return { ok: false, error: "الأوردر ده مش موجود عند شوبيفاي" };
  }

  // ⚠️ **خريطة الأشكال** — شكل شوبيفاي ← الشكل عندنا
  const { data: variants } = await allRows(db
    .from("product_variants")
    .select("id, shopify_variant_id")
    .eq("tenant_id", tenantId)
    .not("shopify_variant_id", "is", null));

  const variantMap: Record<string, string> = {};
  for (const v of (variants ?? []) as {
    id: string;
    shopify_variant_id: string | null;
  }[]) {
    if (v.shopify_variant_id) variantMap[String(v.shopify_variant_id)] = v.id;
  }

  const plan: ResyncPlan = planResync({
    orderStatus: ours.order_status,
    bostaTracking: ours.bosta_tracking,
    ourLines: (ours.order_items ?? []).map((i) => ({
      variantId: i.variant_id,
      quantity: Number(i.quantity),
      salePrice: Number(i.sale_price_at_order),
    })),
    ourDiscount: Number(ours.discount ?? 0),
    ourShipping: Number(ours.shipping_price ?? 0),
    shopLines: theirs.lines.map((l) => ({
      shopifyVariantId: l.shopifyVariantId,
      title: l.title,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
    })),
    shopTotal: 0,
    variantMap,
  });

  if (!plan.ok) return { ok: false, error: plan.reason };
  if (dry) {
    return {
      ok: true,
      summary: resyncSummary(plan),
      before: plan.before,
      after: plan.after,
    };
  }

  /**
   * ⚠️⚠️ **المخزون بيترجّع قبل ما البنود تتمسح.**
   *
   * الأوردر خصم من المخزون وقت ما اتعمل. لو مسحنا البنود وكتبنا غيرها من
   * غير ما نرجّع الخصم القديم، المخزون بيفضل ناقص بالبنود القديمة **زايد**
   * الجديدة — ومحدش بيلاقي السبب بعد شهر.
   */
  const { data: moves } = await db
    .from("stock_movements")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("related_order_id", orderId)
    .limit(1);
  const hadStock = (moves ?? []).length > 0;

  if (hadStock) {
    for (const i of ours.order_items ?? []) {
      if (!i.variant_id || i.quantity <= 0) continue;
      const { data: v } = await db
        .from("product_variants")
        .select("quantity_on_hand")
        .eq("tenant_id", tenantId)
        .eq("id", i.variant_id)
        .maybeSingle();
      const now = Number(
        (v as { quantity_on_hand: number | null } | null)?.quantity_on_hand ?? 0
      );
      await db
        .from("product_variants")
        .update({ quantity_on_hand: now + Number(i.quantity) })
        .eq("tenant_id", tenantId)
        .eq("id", i.variant_id);
      await db.from("stock_movements").insert({
        tenant_id: tenantId,
        variant_id: i.variant_id,
        change_quantity: Number(i.quantity),
        reason: "تعديل أوردر من شوبيفاي",
        related_order_id: orderId,
      });
    }
  }

  // البنود القديمة بتتشال والجديدة بتتكتب
  const { error: delError } = await db
    .from("order_items")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId);
  if (delError) return { ok: false, error: "معرفناش نشيل البنود القديمة" };

  const { error: insError } = await db.from("order_items").insert(
    plan.lines.map((l) => ({
      tenant_id: tenantId,
      order_id: orderId,
      variant_id: l.variantId,
      quantity: l.quantity,
      sale_price_at_order: l.salePrice,
      // ⚠️ التكلفة بتاريخها — بتتاخد من الشكل وقت التعديل
      cost_price_at_order: 0,
    }))
  );
  if (insError) return { ok: false, error: "معرفناش نكتب البنود الجديدة" };

  // والتكلفة من الأشكال
  for (const l of plan.lines) {
    const { data: v } = await db
      .from("product_variants")
      .select("cost_price, quantity_on_hand")
      .eq("tenant_id", tenantId)
      .eq("id", l.variantId)
      .maybeSingle();
    const cost = Number(
      (v as { cost_price: number | null } | null)?.cost_price ?? 0
    );
    if (cost > 0) {
      await db
        .from("order_items")
        .update({ cost_price_at_order: cost })
        .eq("tenant_id", tenantId)
        .eq("order_id", orderId)
        .eq("variant_id", l.variantId);
    }

    if (hadStock) {
      const now = Number(
        (v as { quantity_on_hand: number | null } | null)?.quantity_on_hand ?? 0
      );
      await db
        .from("product_variants")
        .update({ quantity_on_hand: now - l.quantity })
        .eq("tenant_id", tenantId)
        .eq("id", l.variantId);
      await db.from("stock_movements").insert({
        tenant_id: tenantId,
        variant_id: l.variantId,
        change_quantity: -l.quantity,
        reason: "تعديل أوردر من شوبيفاي",
        related_order_id: orderId,
      });
    }
  }

  return {
    ok: true,
    summary: resyncSummary(plan),
    before: plan.before,
    after: plan.after,
  };
}
