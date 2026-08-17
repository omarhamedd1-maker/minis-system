import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const BOSTA_API_KEY = Deno.env.get("BOSTA_API_KEY")!;
const GUARD_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!GUARD_KEY || url.searchParams.get("key") !== GUARD_KEY) return new Response("Unauthorized", { status: 401 });

  const headers = { "Authorization": BOSTA_API_KEY, "X-Requested-By": "minis", "Content-Type": "application/json" };
  const deliveries: any[] = [];
  const seen = new Set<string>();
  let page = 1;
  while (page <= 60) {
    const res = await fetch("https://app.bosta.co/api/v2/deliveries/search", { method: "POST", headers, body: JSON.stringify({ limit: 100, page }) });
    if (res.status !== 200) break;
    const j = await res.json();
    const arr = (j.data?.deliveries ?? j.deliveries ?? []) as any[];
    if (arr.length === 0) break;
    let added = 0;
    for (const d of arr) { const id = String(d._id ?? ""); if (id && !seen.has(id)) { seen.add(id); deliveries.push(d); added++; } }
    if (added === 0) break;
    page++;
  }

  const info = (d: any) => ({
    tracking: String(d?.trackingNumber ?? ""),
    orderNumInBosta: String(d?.shopifyInfo?.orderNumber ?? String(d?.businessReference ?? "").split(":").pop() ?? "").replace("#", "").trim(),
    receiver: d?.receiver?.fullName ?? "",
    state: d?.state?.value ?? "",
    cod: Number(d?.cod ?? 0),
  });

  const wanted = ["1355", "1351", "1358", "1361", "1360"];
  const wantedTracks = ["4075281632", "3649517823", "8550116799"];

  const { data: orders } = await supabase
    .from("orders")
    .select("order_number, order_status, bosta_state, bosta_cod, bosta_tracking, bosta_collected, customers(full_name)")
    .in("order_number", wanted);

  const system = (orders ?? []).map((o: any) => ({
    order: o.order_number, customer: o.customers?.full_name ?? "", status: o.order_status,
    bosta_state: o.bosta_state, bosta_tracking: o.bosta_tracking, bosta_cod: o.bosta_cod, collected: o.bosta_collected,
  }));

  const bostaByNum: any = {};
  for (const n of wanted) bostaByNum[n] = deliveries.filter((d) => info(d).orderNumInBosta === n).map(info);
  const bostaByTrack: any = {};
  for (const t of wantedTracks) { const d = deliveries.find((x) => info(x).tracking === t); bostaByTrack[t] = d ? info(d) : "مش موجود"; }

  return new Response(JSON.stringify({ system, bostaByNum, bostaByTrack }, null, 2), { headers: { "Content-Type": "application/json" } });
});