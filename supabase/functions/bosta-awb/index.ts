import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BOSTA_API_KEY = Deno.env.get("BOSTA_API_KEY")!;
const GUARD_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!GUARD_KEY || url.searchParams.get("key") !== GUARD_KEY) return new Response("Unauthorized", { status: 401 });
  const numParam = url.searchParams.get("num");
  const orderIdParam = url.searchParams.get("order");
  const auth = { "Authorization": BOSTA_API_KEY, "X-Requested-By": "minis" };
  const headers = { ...auth, "Content-Type": "application/json" };

  try {
    let q = supabase.from("orders").select("bosta_tracking");
    if (orderIdParam) q = q.eq("id", orderIdParam);
    else if (numParam) q = q.eq("order_number", numParam);
    else return new Response("لازم order أو num", { status: 400 });
    const { data: order } = await q.maybeSingle();
    const tracking = order?.bosta_tracking ? String(order.bosta_tracking) : "";
    if (!tracking) return new Response("مفيش شحنة بوسطة للأوردر ده", { status: 404 });

    let id = "", page = 1;
    while (page <= 60 && !id) {
      const res = await fetch("https://app.bosta.co/api/v2/deliveries/search", { method: "POST", headers, body: JSON.stringify({ limit: 100, page }) });
      if (res.status !== 200) break;
      const j = await res.json();
      const arr = (j.data?.deliveries ?? j.deliveries ?? []) as any[];
      if (arr.length === 0) break;
      const f = arr.find((d) => String(d?.trackingNumber ?? "") === tracking);
      if (f) id = String(f._id);
      page++;
    }
    if (!id) return new Response("الشحنة مش موجودة في بوسطة", { status: 404 });

    const r = await fetch(`https://app.bosta.co/api/v0/deliveries/awb/${id}`, { headers: auth });
    if (r.status !== 200) return new Response("بوسطة رفضت البوليصة: " + r.status, { status: 502 });
    const j = await r.json();
    const b64 = (j?.data?.data ?? j?.data);
    if (!b64 || typeof b64 !== "string") return new Response("مفيش بوليصة", { status: 404 });

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" } });
  } catch (e) {
    return new Response("Error: " + String(e), { status: 500 });
  }
});