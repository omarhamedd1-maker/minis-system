// ============================================
// Minis System — Shopify Order Webhook Receiver
// Supabase Edge Function (Deno)
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHOPIFY_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---- Verify the request really came from Shopify ----
async function verifyShopify(rawBody: string, hmacHeader: string | null) {
  if (!hmacHeader) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SHOPIFY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );

  const digest = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return digest === hmacHeader;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const hmac = req.headers.get("X-Shopify-Hmac-Sha256");

  const valid = await verifyShopify(rawBody, hmac);
  if (!valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  const order = JSON.parse(rawBody);

  try {
    // ---- 1. Customer (create or reuse) ----
    let customerId: string | null = null;
    const c = order.customer;

    if (c) {
      const shopifyCustomerId = String(c.id);
      const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ") ||
        "بدون اسم";
      const phone = c.phone ?? order.shipping_address?.phone ?? null;
      const address = order.shipping_address
        ? [
          order.shipping_address.address1,
          order.shipping_address.address2,
          order.shipping_address.city,
        ].filter(Boolean).join(", ")
        : null;

      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("shopify_customer_id", shopifyCustomerId)
        .maybeSingle();

      if (existing) {
        customerId = existing.id;
      } else {
        const { data: inserted, error } = await supabase
          .from("customers")
          .insert({
            shopify_customer_id: shopifyCustomerId,
            full_name: fullName,
            phone,
            address,
          })
          .select("id")
          .single();
        if (error) throw error;
        customerId = inserted.id;
      }
    }

    // ---- 2. Order (skip if it already exists) ----
    const shopifyOrderId = String(order.id);

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("shopify_order_id", shopifyOrderId)
      .maybeSingle();

    if (existingOrder) {
      return new Response("Order already recorded", { status: 200 });
    }

        const shippingPrice = Number(
      order.total_shipping_price_set?.shop_money?.amount ??
        order.shipping_lines?.[0]?.price ??
        0,
    );

    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        shopify_order_id: shopifyOrderId,
        order_number: String(order.order_number ?? order.name ?? ""),
        customer_id: customerId,
        order_status: "new",
        order_date: order.created_at ?? new Date().toISOString(),
        shipping_price: shippingPrice,
      })
      .select("id")
      .single();

    if (orderError) throw orderError;
    const orderId = newOrder.id;

    // ---- 3. Line items ----
    for (const item of order.line_items ?? []) {
      const shopifyVariantId = String(item.variant_id);
      const shopifyProductId = String(item.product_id);

      // find the variant
      let { data: variant } = await supabase
        .from("product_variants")
        .select("id, cost_price, sku")
        .eq("shopify_variant_id", shopifyVariantId)
        .maybeSingle();

      // لو المنتج موجود من غير كود، نكمّل الكود من شوبيفاي
      if (variant && !variant.sku && item.sku) {
        await supabase
          .from("product_variants")
          .update({ sku: item.sku })
          .eq("id", variant.id);
      }

      // if it doesn't exist yet, create the product + variant with cost = 0
      if (!variant) {
        let { data: product } = await supabase
          .from("products")
          .select("id")
          .eq("shopify_product_id", shopifyProductId)
          .maybeSingle();

        if (!product) {
          const { data: newProduct, error: pErr } = await supabase
            .from("products")
            .insert({
              name: item.title ?? "منتج بدون اسم",
              shopify_product_id: shopifyProductId,
            })
            .select("id")
            .single();
          if (pErr) throw pErr;
          product = newProduct;
        }

        const { data: newVariant, error: vErr } = await supabase
          .from("product_variants")
          .insert({
            product_id: product.id,
            variant_name: item.variant_title ?? null,
            shopify_variant_id: shopifyVariantId,
            sku: item.sku ?? null, // ← الكود من شوبيفاي
            cost_price: 0, // ← اتملى يدوي بعدين
            sale_price: Number(item.price ?? 0),
            quantity_on_hand: 0,
          })
          .select("id, cost_price")
          .single();
        if (vErr) throw vErr;
        variant = newVariant;
      }

      const qty = Number(item.quantity ?? 1);

      // order item with price/cost snapshot
      const { error: itemErr } = await supabase.from("order_items").insert({
        order_id: orderId,
        variant_id: variant.id,
        quantity: qty,
        sale_price_at_order: Number(item.price ?? 0),
        cost_price_at_order: Number(variant.cost_price ?? 0),
      });
      if (itemErr) throw itemErr;

      // stock movement (out)
      await supabase.from("stock_movements").insert({
        variant_id: variant.id,
        change_quantity: -qty,
        reason: "order",
        related_order_id: orderId,
      });

      // decrement stock on hand
      await supabase.rpc("decrement_stock", {
        p_variant_id: variant.id,
        p_qty: qty,
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Error: " + String(err), { status: 500 });
  }
});