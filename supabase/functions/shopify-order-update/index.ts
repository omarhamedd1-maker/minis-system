// Minis System — Shopify Order UPDATE webhook (شوبيفاي → السيستم)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHOPIFY_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET")!;
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifyShopify(rawBody: string, hmacHeader: string | null) {
  if (!hmacHeader) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SHOPIFY_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const digest = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return digest === hmacHeader;
}

const skuFromTitle = (t: string) => {
  const m = /\[([^\]]+)\]\s*$/.exec(String(t ?? ""));
  return m ? m[1] : null;
};

async function resolveVariant(item: any) {
  const shopifyVariantId = String(item.variant_id);
  const shopifyProductId = String(item.product_id);
  let { data: variant } = await supabase.from("product_variants")
    .select("id, cost_price, sku").eq("shopify_variant_id", shopifyVariantId).maybeSingle();
  if (variant && !variant.sku && item.sku) {
    await supabase.from("product_variants").update({ sku: item.sku }).eq("id", variant.id);
  }
  if (!variant) {
    let { data: product } = await supabase.from("products")
      .select("id").eq("shopify_product_id", shopifyProductId).maybeSingle();
    if (!product) {
      const { data: np } = await supabase.from("products")
        .insert({ name: item.title ?? "منتج بدون اسم", shopify_product_id: shopifyProductId })
        .select("id").single();
      product = np;
    }
    const { data: nv } = await supabase.from("product_variants").insert({
      product_id: product!.id, variant_name: item.variant_title ?? null,
      shopify_variant_id: shopifyVariantId, sku: item.sku ?? null,
      cost_price: 0, sale_price: Number(item.price ?? 0), quantity_on_hand: 0,
    }).select("id, cost_price").single();
    variant = nv;
  }
  return variant;
}

async function adjustStock(variantId: string, delta: number, orderId: string, reason: string) {
  if (!variantId || delta === 0) return;
  const { data: v } = await supabase.from("product_variants")
    .select("quantity_on_hand").eq("id", variantId).maybeSingle();
  if (!v) return;
  await supabase.from("product_variants")
    .update({ quantity_on_hand: v.quantity_on_hand + delta }).eq("id", variantId);
  await supabase.from("stock_movements").insert({
    variant_id: variantId, change_quantity: delta, reason, related_order_id: orderId,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await req.text();
  const hmac = req.headers.get("X-Shopify-Hmac-Sha256");
  if (!(await verifyShopify(rawBody, hmac))) return new Response("Unauthorized", { status: 401 });
  const order = JSON.parse(rawBody);

  try {
    const shopifyOrderId = String(order.id);
    const { data: existingOrder } = await supabase.from("orders")
      .select("id, shopify_updated_at").eq("shopify_order_id", shopifyOrderId).maybeSingle();
    if (!existingOrder) return new Response("Order not in system, ignored", { status: 200 });
    const orderId = existingOrder.id;

    // نرفض الرسايل القديمة — شوبيفاي بيعيد إرسال اللي فشل قبل كده وبتكتب فوق الجديد
    const incomingAt = order.updated_at ? new Date(order.updated_at).getTime() : 0;
    const storedAt = existingOrder.shopify_updated_at
      ? new Date(existingOrder.shopify_updated_at).getTime()
      : 0;
    if (incomingAt && storedAt && incomingAt <= storedAt) {
      return new Response("Stale webhook, ignored", { status: 200 });
    }
    if (order.updated_at) {
      await supabase.from("orders").update({ shopify_updated_at: order.updated_at }).eq("id", orderId);
    }

    // خصوماتنا (تعديل سعر من السيستم) — بنتجاهلها لمنع اللفة
    const ourApps = new Set<number>();
    (order.discount_applications ?? []).forEach((a: any, i: number) => {
      if (String(a?.description ?? "") === "تعديل سعر من Minis System") ourApps.add(i);
    });

    const desired = new Map<string, { qty: number; price: number | null; cost: number }>();
    for (const item of order.line_items ?? []) {
      const qty = Number(item.current_quantity ?? item.quantity ?? 0);
      if (qty <= 0) continue;

      let v: any = null;
      if (item.variant_id) {
        v = await resolveVariant(item);
      } else {
        // بند مخصوص: نرجّعه لصاحبه بالكود اللي جوه الاسم [sku]
        const sku = skuFromTitle(item.title);
        if (sku) {
          const { data } = await supabase.from("product_variants")
            .select("id, cost_price, sku").eq("sku", sku).maybeSingle();
          v = data;
        }
        if (!v) continue; // بند غريب مش بتاعنا — نتجاهله بأمان
      }

      const allocs = item.discount_allocations ?? [];
      const hasOurs = allocs.some((a: any) => ourApps.has(Number(a?.discount_application_index)));
      let price: number | null;
      if (hasOurs) {
        price = null; // سعره متظبط من السيستم — منلمسوش
      } else {
        const lineDiscount = allocs.reduce((s: number, a: any) => s + Number(a?.amount ?? 0), 0);
        price = Math.round((Number(item.price ?? 0) - lineDiscount / qty) * 100) / 100;
      }
      const prev = desired.get(v.id);
      if (prev) prev.qty += qty;
      else desired.set(v.id, { qty, price, cost: Number(v.cost_price ?? 0) });
    }

    const { data: current } = await supabase.from("order_items")
      .select("id, variant_id, quantity, sale_price_at_order").eq("order_id", orderId);
    const currentByVar = new Map<string, any>();
    for (const it of current ?? []) currentByVar.set(it.variant_id, it);

    let changed = 0;

    for (const [variantId, d] of desired) {
      const cur = currentByVar.get(variantId);
      if (cur) {
        const upd: Record<string, unknown> = {};
        if (cur.quantity !== d.qty) upd.quantity = d.qty;
        // السعر بيتحكم فيه السيستم بس — الويبهوك ميلمسوش عشان يمنع اللفة
        if (Object.keys(upd).length) {
          await supabase.from("order_items").update(upd).eq("id", cur.id);
          if (upd.quantity !== undefined) {
            await adjustStock(variantId, cur.quantity - d.qty, orderId, "تعديل كمية من شوبيفاي");
          }
          changed++;
        }
      } else {
        await supabase.from("order_items").insert({
          order_id: orderId, variant_id: variantId, quantity: d.qty,
          sale_price_at_order: d.price ?? 0, cost_price_at_order: d.cost,
        });
        await adjustStock(variantId, -d.qty, orderId, "إضافة منتج من شوبيفاي");
        changed++;
      }
    }

    for (const [variantId, cur] of currentByVar) {
      if (!desired.has(variantId)) {
        await supabase.from("order_items").delete().eq("id", cur.id);
        await adjustStock(variantId, cur.quantity, orderId, "مسح منتج من شوبيفاي");
        changed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, changed }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("update webhook error:", err);
    return new Response("Error: " + String(err), { status: 500 });
  }
});