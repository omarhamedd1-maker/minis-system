import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET")!;
const SHOP = Deno.env.get("SHOPIFY_SHOP")!;
const GUARD_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API = "2026-07";
const LABEL = "تعديل سعر من Minis System";

async function getToken() {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (res.status !== 200) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}
async function gql(token: string, query: string, variables: any) {
  const res = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error("gql: " + JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!GUARD_KEY || url.searchParams.get("key") !== GUARD_KEY) return new Response("Unauthorized", { status: 401 });
  const dry = url.searchParams.get("dry") === "1";
  const orderIdParam = url.searchParams.get("order");
  const numParam = url.searchParams.get("num");

  try {
    let q = supabase.from("orders").select("id, shopify_order_id, discount, order_items(quantity, sale_price_at_order, product_variants(shopify_variant_id))");
    if (orderIdParam) q = q.eq("id", orderIdParam);
    else if (numParam) q = q.eq("order_number", numParam);
    else return new Response(JSON.stringify({ error: "لازم order أو num" }), { status: 400 });
    const { data: order } = await q.maybeSingle();
    if (!order) return new Response(JSON.stringify({ error: "الأوردر مش موجود" }), { status: 404 });
    if (!order.shopify_order_id || String(order.shopify_order_id).startsWith("import-"))
      return new Response(JSON.stringify({ error: "الأوردر مش مربوط بشوبيفاي" }), { status: 400 });

    const desired = new Map<string, { qty: number; price: number }>();
    for (const it of order.order_items ?? []) {
      const svid = (it as any).product_variants?.shopify_variant_id;
      if (!svid || String(svid).startsWith("import-")) continue;
      const cur = desired.get(String(svid));
      if (cur) cur.qty += Number(it.quantity);
      else desired.set(String(svid), { qty: Number(it.quantity), price: Number(it.sale_price_at_order) });
    }
    const orderDiscount = Math.max(0, Number((order as any).discount ?? 0));
    if (orderDiscount > 0) {
      let tot = 0; for (const [, d] of desired) tot += d.price * d.qty;
      if (tot > 0) { const f = Math.max(0, 1 - orderDiscount / tot); for (const [, d] of desired) d.price = Math.round(d.price * f * 100) / 100; }
    }

    const token = await getToken();
    const orderGid = `gid://shopify/Order/${order.shopify_order_id}`;
    const curQ = await gql(token, `query($id: ID!){ order(id:$id){ lineItems(first:100){ nodes{ quantity variant{ legacyResourceId } originalUnitPriceSet{ shopMoney{ amount } } discountedUnitPriceSet{ shopMoney{ amount } } } } } }`, { id: orderGid });
    const shopByVar = new Map<string, { qty: number; base: number; eff: number }>();
    for (const l of curQ.order?.lineItems?.nodes ?? []) {
      const v = l.variant?.legacyResourceId; if (v && Number(l.quantity) > 0) shopByVar.set(String(v), { qty: Number(l.quantity), base: Number(l.originalUnitPriceSet?.shopMoney?.amount ?? 0), eff: Number(l.discountedUnitPriceSet?.shopMoney?.amount ?? 0) });
    }

    const onlyQty: any[] = [], priceFix: any[] = [], toAdd: any[] = [], toRemove: string[] = [], cantRaise: any[] = [];
    for (const [svid, d] of desired) {
      const s = shopByVar.get(svid);
      if (!s) { toAdd.push({ svid, qty: d.qty, price: d.price }); continue; }
      if (s.qty !== d.qty) onlyQty.push({ svid, qty: d.qty });
      if (Math.abs(d.price - s.eff) >= 0.01) {
        if (d.price > s.base + 0.009) cantRaise.push({ svid, system: d.price, base: s.base });
        else priceFix.push({ svid, target: d.price, base: s.base });
      }
    }
    for (const [svid] of shopByVar) if (!desired.has(svid)) toRemove.push(svid);

    const changes = onlyQty.length + priceFix.length + toAdd.length + toRemove.length;
    if (changes === 0) return new Response(JSON.stringify({ ok: true, changed: 0, msg: "مفيش فرق", cantRaise }), { headers: { "Content-Type": "application/json" } });
    if (dry) return new Response(JSON.stringify({ dry: true, onlyQty, priceFix, toAdd, toRemove, cantRaise }, null, 2), { headers: { "Content-Type": "application/json" } });

    const begin = await gql(token, `mutation($id: ID!){ orderEditBegin(id:$id){ calculatedOrder{ id lineItems(first:100){ nodes{ id quantity variant{ legacyResourceId } calculatedDiscountAllocations{ discountApplication{ id description } } } } } userErrors{ message } } }`, { id: orderGid });
    if (begin.orderEditBegin.userErrors?.length) throw new Error("begin: " + JSON.stringify(begin.orderEditBegin.userErrors));
    const calcId = begin.orderEditBegin.calculatedOrder.id;
    const calcByVar = new Map<string, { li: string; ourDisc: string[] }>();
    const known = new Set<string>();
    for (const n of begin.orderEditBegin.calculatedOrder.lineItems.nodes) {
      known.add(n.id);
      const v = n.variant?.legacyResourceId; if (!v) continue;
      const our = (n.calculatedDiscountAllocations ?? []).filter((a: any) => String(a?.discountApplication?.description ?? "") === LABEL).map((a: any) => a.discountApplication.id);
      calcByVar.set(String(v), { li: n.id, ourDisc: our });
    }

    const setQty = async (li: string, qty: number) => { const r = await gql(token, `mutation($id:ID!,$li:ID!,$q:Int!){ orderEditSetQuantity(id:$id,lineItemId:$li,quantity:$q,restock:false){ userErrors{ message } } }`, { id: calcId, li, q: qty }); if (r.orderEditSetQuantity.userErrors?.length) throw new Error("set: " + JSON.stringify(r.orderEditSetQuantity.userErrors)); };
    const rmDisc = async (appId: string) => { const r = await gql(token, `mutation($id:ID!,$d:ID!){ orderEditRemoveLineItemDiscount(id:$id,discountApplicationId:$d){ userErrors{ message } } }`, { id: calcId, d: appId }); if (r.orderEditRemoveLineItemDiscount.userErrors?.length) throw new Error("rmDisc: " + JSON.stringify(r.orderEditRemoveLineItemDiscount.userErrors)); };
    const addDisc = async (li: string, pct: number) => { const r = await gql(token, `mutation($id:ID!,$li:ID!,$d:OrderEditAppliedDiscountInput!){ orderEditAddLineItemDiscount(id:$id,lineItemId:$li,discount:$d){ userErrors{ message } } }`, { id: calcId, li, d: { description: LABEL, percentValue: pct } }); if (r.orderEditAddLineItemDiscount.userErrors?.length) throw new Error("disc: " + JSON.stringify(r.orderEditAddLineItemDiscount.userErrors)); };
    const addVar = async (svid: string, qty: number) => { const r = await gql(token, `mutation($id:ID!,$v:ID!,$q:Int!){ orderEditAddVariant(id:$id,variantId:$v,quantity:$q,allowDuplicates:true){ calculatedOrder{ lineItems(first:100){ nodes{ id quantity variant{ legacyResourceId } originalUnitPriceSet{ shopMoney{ amount } } } } } userErrors{ message } } }`, { id: calcId, v: `gid://shopify/ProductVariant/${svid}`, q: qty }); if (r.orderEditAddVariant.userErrors?.length) throw new Error("add: " + JSON.stringify(r.orderEditAddVariant.userErrors)); const n = (r.orderEditAddVariant.calculatedOrder?.lineItems?.nodes ?? []).find((x: any) => String(x.variant?.legacyResourceId ?? "") === svid && !known.has(x.id) && Number(x.quantity) > 0); if (n) known.add(n.id); return n ? { id: n.id, base: Number(n.originalUnitPriceSet?.shopMoney?.amount ?? 0) } : null; };
    const pct = (base: number, target: number) => Math.round(((base - target) / base) * 1000000) / 10000;

    for (const { svid, qty } of onlyQty) { const c = calcByVar.get(svid); if (c) await setQty(c.li, qty); }
    for (const svid of toRemove) { const c = calcByVar.get(svid); if (c) await setQty(c.li, 0); }
    for (const { svid, target, base } of priceFix) {
      const c = calcByVar.get(svid); if (!c) continue;
      for (const appId of c.ourDisc) await rmDisc(appId);   // شيل خصمنا القديم
      if (target < base - 0.009) await addDisc(c.li, pct(base, target)); // خصم واحد صح
    }
    for (const { svid, qty, price } of toAdd) { const f = await addVar(svid, qty); if (f && price < f.base - 0.009) await addDisc(f.id, pct(f.base, price)); }

    const commit = await gql(token, `mutation($id:ID!){ orderEditCommit(id:$id,notifyCustomer:false,staffNote:"تعديل من Minis System"){ userErrors{ message } } }`, { id: calcId });
    if (commit.orderEditCommit.userErrors?.length) throw new Error("commit: " + JSON.stringify(commit.orderEditCommit.userErrors));

    return new Response(JSON.stringify({ ok: true, changed: changes, onlyQty, priceFix, toAdd, toRemove, cantRaise }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});