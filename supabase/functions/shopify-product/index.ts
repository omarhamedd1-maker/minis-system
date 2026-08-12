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
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const digest = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return digest === hmacHeader;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await req.text();
  const hmac = req.headers.get("X-Shopify-Hmac-Sha256");
  const topic = req.headers.get("X-Shopify-Topic") ?? "";
  if (!(await verifyShopify(rawBody, hmac))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  const pid = String(payload.id);

  try {
    if (topic === "products/delete") {
      await supabase.from("products").update({ deleted_in_shopify: true }).eq("shopify_product_id", pid);
      return new Response("Flagged deleted", { status: 200 });
    }

    const title = String(payload.title ?? "منتج بدون اسم").trim();
    const status = payload.status ?? null;
    const variants = payload.variants ?? [];

    // نلاقي المنتج: بالمعرّف، وإلا بالكود، وإلا بالاسم الإنجليزي
    let product: { id: string } | null = null;
    const r1 = await supabase.from("products").select("id").eq("shopify_product_id", pid).maybeSingle();
    product = r1.data;
    if (!product) {
      for (const v of variants) {
        const sku = String(v.sku ?? "").trim();
        if (sku) {
          const pv = await supabase.from("product_variants").select("product_id").eq("sku", sku).maybeSingle();
          if (pv.data) { const p = await supabase.from("products").select("id").eq("id", pv.data.product_id).maybeSingle(); product = p.data; break; }
        }
      }
    }
    if (!product) {
      const rn = await supabase.from("products").select("id").eq("name", title).maybeSingle();
      product = rn.data;
    }
    if (product) {
      await supabase.from("products").update({ name: title, shopify_product_id: pid, deleted_in_shopify: false, shopify_status: status }).eq("id", product.id);
    } else {
      const np = await supabase.from("products").insert({ name: title, shopify_product_id: pid, shopify_status: status }).select("id").single();
      product = np.data;
    }

    for (const v of variants) {
      const vid = String(v.id);
      const sku = String(v.sku ?? "").trim() || null;
      const price = Number(v.price ?? 0);
      const vname = v.title && v.title !== "Default Title" ? v.title : null;

      let variant: { id: string } | null = null;
      const rv = await supabase.from("product_variants").select("id").eq("shopify_variant_id", vid).maybeSingle();
      variant = rv.data;
      if (!variant && sku) {
        const rs = await supabase.from("product_variants").select("id").eq("sku", sku).maybeSingle();
        variant = rs.data;
      }
      if (!variant) {
        // لو المنتج ليه شكل واحد بس، نستخدمه (المنتجات العادية)
        const ex = await supabase.from("product_variants").select("id").eq("product_id", product!.id);
        if (ex.data && ex.data.length === 1) variant = ex.data[0];
      }
      if (variant) {
        const upd: Record<string, unknown> = { sale_price: price, shopify_variant_id: vid, product_id: product!.id, variant_name: vname };
        if (sku) upd.sku = sku;
        await supabase.from("product_variants").update(upd).eq("id", variant.id);
      } else {
        await supabase.from("product_variants").insert({ product_id: product!.id, variant_name: vname, shopify_variant_id: vid, sku, sale_price: price, cost_price: 0, quantity_on_hand: 0 });
      }
    }
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("shopify-product error:", String(err));
    return new Response("Error: " + String(err), { status: 500 });
  }
});