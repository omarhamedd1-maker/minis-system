import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET")!;
const SHOP = Deno.env.get("SHOPIFY_SHOP")!;
const GUARD_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const API_VERSION = "2026-07";
const numId = (gid: string) => String(gid).split("/").pop() ?? "";

async function getToken(): Promise<string> {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (res.status !== 200) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

async function fetchProducts(token: string) {
  const out: { pid: string; title: string; status: string; variants: { vid: string; barcode: string | null; price: string | null }[] }[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const query = `query($cursor: String){ products(first: 100, after: $cursor){ pageInfo{ hasNextPage endCursor } nodes{ id title status variants(first: 20){ nodes{ id barcode price } } } } }`;
    const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { cursor } }),
    });
    const j = await res.json();
    if (j.errors) throw new Error("graphql: " + JSON.stringify(j.errors).slice(0, 300));
    const p = j.data.products;
    for (const n of p.nodes) out.push({ pid: numId(n.id), title: (n.title ?? "").trim(), status: String(n.status ?? "").toLowerCase(),
      variants: n.variants.nodes.map((v: any) => ({ vid: numId(v.id), barcode: (v.barcode ?? "").trim() || null, price: v.price ?? null })) });
    if (!p.pageInfo.hasNextPage) break;
    cursor = p.pageInfo.endCursor;
  }
  return out;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!GUARD_KEY || url.searchParams.get("key") !== GUARD_KEY) return new Response("Unauthorized", { status: 401 });
  const dry = url.searchParams.get("dry") === "1";
  try {
    const token = await getToken();
    const products = await fetchProducts(token);
    const { data: sysProducts } = await supabase.from("products").select("id, shopify_product_id, name, shopify_status");
    const { data: sysVariants } = await supabase.from("product_variants").select("id, product_id, sku, shopify_variant_id");

    const prodById = new Map<string, any>();
    for (const p of sysProducts ?? []) prodById.set(p.id, p);
    const varBySku = new Map<string, any>();
    for (const v of sysVariants ?? []) if (v.sku) varBySku.set(String(v.sku).trim(), v);

    const fixes: { svId: string; productId: string | null; vid: string; pid: string; needVid: boolean; needPid: boolean }[] = [];
    const missing: { pid: string; title: string; vid: string; barcode: string; price: string | null; status: string }[] = [];
    const statusFix: { productId: string; status: string }[] = [];
    for (const p of products) for (const v of p.variants) {
      if (!v.barcode) continue;
      const sv = varBySku.get(v.barcode);
      if (sv) {
        const prod = prodById.get(sv.product_id);
        const needVid = String(sv.shopify_variant_id ?? "") !== v.vid;
        const needPid = !!prod && String(prod.shopify_product_id ?? "") !== p.pid;
        if (needVid || needPid) fixes.push({ svId: sv.id, productId: prod?.id ?? null, vid: v.vid, pid: p.pid, needVid, needPid });
        if (prod && p.status && String(prod.shopify_status ?? "") !== p.status) statusFix.push({ productId: prod.id, status: p.status });
      } else {
        missing.push({ pid: p.pid, title: p.title, vid: v.vid, barcode: v.barcode, price: v.price, status: p.status });
      }
    }

    const errors: string[] = [];
    const logErr = (t: string, e: any) => { if (e && errors.length < 15) errors.push(`${t}: ${e.message}`); };

    if (!dry) {
      for (const f of fixes) {
        if (f.needVid) logErr(`tmpV`, (await supabase.from("product_variants").update({ shopify_variant_id: `tmp-v-${f.svId}` }).eq("id", f.svId)).error);
        if (f.needPid && f.productId) logErr(`tmpP`, (await supabase.from("products").update({ shopify_product_id: `tmp-p-${f.productId}` }).eq("id", f.productId)).error);
      }
      for (const f of fixes) {
        if (f.needVid) logErr(`vid`, (await supabase.from("product_variants").update({ shopify_variant_id: f.vid }).eq("id", f.svId)).error);
        if (f.needPid && f.productId) logErr(`pid`, (await supabase.from("products").update({ shopify_product_id: f.pid }).eq("id", f.productId)).error);
      }
      for (const s of statusFix) logErr(`status`, (await supabase.from("products").update({ shopify_status: s.status }).eq("id", s.productId)).error);
      for (const m of missing) {
        const { data: np, error: pe } = await supabase.from("products").insert({ shopify_product_id: m.pid, name: m.title, shopify_status: m.status || null }).select("id").maybeSingle();
        if (pe) { logErr(`insert ${m.title}`, pe); continue; }
        logErr(`insertVar ${m.title}`, (await supabase.from("product_variants").insert({ product_id: np!.id, variant_name: null, sku: m.barcode, cost_price: 0, sale_price: Number(m.price ?? 0) || 0, quantity_on_hand: 0, shopify_variant_id: m.vid })).error);
      }
    }

    return new Response(JSON.stringify({ mode: dry ? "DRY RUN" : "تم التنفيذ", shopify_products: products.length, to_fix: fixes.length, to_insert: missing.length, status_updates: statusFix.length, errors }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});