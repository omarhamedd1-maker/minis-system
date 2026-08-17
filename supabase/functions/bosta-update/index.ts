import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BOSTA_API_KEY = Deno.env.get("BOSTA_API_KEY")!;
const GUARD_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// بعد ما المندوب ياخد الشحنة مينفعش تعديل
function editable(v: string): boolean {
  const x = (v ?? "").toLowerCase();
  return !(x.includes("picked") || x.includes("transit") || x.includes("out for") || x.includes("deliver") || x.includes("return") || x.includes("received"));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!GUARD_KEY || url.searchParams.get("key") !== GUARD_KEY) return new Response("Unauthorized", { status: 401 });
  const dry = url.searchParams.get("dry") === "1";
  const orderIdParam = url.searchParams.get("order");
  const numParam = url.searchParams.get("num");
  const headers = { "Authorization": BOSTA_API_KEY, "X-Requested-By": "minis", "Content-Type": "application/json" };

  try {
    let q = supabase.from("orders").select("id, order_number, bosta_tracking, discount, shipping_price, order_items(quantity, sale_price_at_order)");
    if (orderIdParam) q = q.eq("id", orderIdParam);
    else if (numParam) q = q.eq("order_number", numParam);
    else return new Response(JSON.stringify({ error: "لازم order أو num" }), { status: 400 });
    const { data: order } = await q.maybeSingle();
    if (!order) return new Response(JSON.stringify({ error: "الأوردر مش موجود" }), { status: 404 });
    const tracking = order.bosta_tracking ? String(order.bosta_tracking) : "";
    if (!tracking) return new Response(JSON.stringify({ ok: true, msg: "مفيش شحنة بوسطة مربوطة" }), { headers: { "Content-Type": "application/json" } });

    const itemsTotal = (order.order_items ?? []).reduce((s: number, it: any) => s + Number(it.quantity) * Number(it.sale_price_at_order), 0);
    const pieces = (order.order_items ?? []).reduce((s: number, it: any) => s + Number(it.quantity), 0);
    const newCod = Math.round((itemsTotal - Number(order.discount ?? 0) + Number(order.shipping_price ?? 0)) * 100) / 100;

    let found: any = null, page = 1;
    while (page <= 60 && !found) {
      const res = await fetch("https://app.bosta.co/api/v2/deliveries/search", { method: "POST", headers, body: JSON.stringify({ limit: 100, page }) });
      if (res.status !== 200) break;
      const j = await res.json();
      const arr = (j.data?.deliveries ?? j.deliveries ?? []) as any[];
      if (arr.length === 0) break;
      found = arr.find((d) => String(d?.trackingNumber ?? "") === tracking) ?? null;
      page++;
    }
    if (!found) return new Response(JSON.stringify({ error: "الشحنة مش موجودة في بوسطة" }), { status: 404 });

    const state = found?.state?.value ?? "";
    const currentCod = Number(found?.cod ?? 0);
    if (!editable(state)) return new Response(JSON.stringify({ ok: false, msg: "الشحنة اتاخدت — مينفعش تعديل", state }), { headers: { "Content-Type": "application/json" } });
    if (Math.abs(currentCod - newCod) < 0.01) return new Response(JSON.stringify({ ok: true, changed: false, cod: newCod, state }), { headers: { "Content-Type": "application/json" } });
    if (dry) return new Response(JSON.stringify({ dry: true, would_set_cod: newCod, from: currentCod, state, deliveryId: found._id }, null, 2), { headers: { "Content-Type": "application/json" } });

    const put = await fetch(`https://app.bosta.co/api/v2/deliveries/${found._id}`, { method: "PUT", headers, body: JSON.stringify({ cod: newCod, specs: { packageDetails: { itemsCount: pieces } } }) });
    const putText = await put.text();
    if (put.status < 200 || put.status >= 300) return new Response(JSON.stringify({ error: `PUT ${put.status}: ${putText.slice(0, 300)}` }), { status: 500 });

    return new Response(JSON.stringify({ ok: true, changed: true, cod: newCod, from: currentCod, state }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});