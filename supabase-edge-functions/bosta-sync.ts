// ==========================================================================
// دالة bosta-sync (اسم الـ endpoint الحقيقي: bright-endpoint)
// انسخ الكود ده كله مكان القديم في لوحة Supabase، وتأكد إن Verify JWT = OFF
//
// اللي اتغيّر عن النسخة القديمة (حاجة واحدة بس):
//   الأوردر اللي حالته "مرتجع بعد التسليم" (returned_after_delivery)
//   بتفضل حالته زي ما هي — المزامنة تحدّث بياناته من بوسطة عادي
//   (التتبع، التحصيل، الرسوم) بس مابتلمسش الحالة.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOSTA_API_KEY = Deno.env.get("BOSTA_API_KEY")!;
const GUARD_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TRANSFER_RATE = 0.01, TRANSFER_MIN = 13, COD_FEE_RATE = 0.01, COD_FEE_THRESHOLD = 2000;
const OPEN_FEE = 7, INSURANCE_RATE = 0.01, INSURANCE_MIN = 10, VAT = 1.14;

// الحالات اللي المزامنة مامنفعش تغيّرها (بنحددها إحنا يدوي)
const LOCKED_STATUSES = ["cancelled", "returned_after_delivery"];

// خريطة حالات بوسطة لحالات السيستم — الترتيب مهم (الأخص الأول)
function mapState(s: string | null): string | null {
  const x = (s ?? "").toLowerCase();

  // ملغي من بوسطة
  if (x.includes("cancel")) return "cancelled";

  // رجعت لنا فعلاً (وصلت المخزن/الأصل)
  if (
    x.includes("returned to origin") ||
    x.includes("returned to business") ||
    x === "returned" ||
    x.includes("exchanged & returned")
  ) {
    return "returned";
  }
  // راجعة لنا لكن لسه في الطريق
  if (x.includes("return")) return "returning";

  // بوسطة واقفة ومحتاجة تصرّف مننا (عنوان غلط / العميل مش بيرد / رفض...)
  if (
    x.includes("awaiting action") ||
    x.includes("action required") ||
    x.includes("exception") ||
    x.includes("on hold")
  ) {
    return "awaiting_action";
  }

  if (x.includes("deliver") && !x.includes("out for delivery")) return "delivered";

  // خرجت من الفرع وماشية للعميل
  if (x.includes("out for delivery") || x.includes("with courier")) {
    return "out_for_delivery";
  }

  // المندوب استلمها / جوّه شبكة بوسطة
  if (
    x.includes("picked") ||
    x.includes("transit") ||
    x.includes("in-transit") ||
    x.includes("received") ||
    x.includes("processing") ||
    x.includes("at warehouse") ||
    x.includes("hub")
  ) {
    return "shipped";
  }

  // الشحنة اتعملت ومستنية المندوب
  if (
    x.includes("created") ||
    x.includes("requested") ||
    x.includes("waiting for pickup") ||
    x.includes("pickup") ||
    x.includes("route")
  ) {
    return "ready";
  }
  return null;
}
function bostaCost(cod: number, productValue: number, allowOpen: boolean, returned: boolean) {
  const openFee = allowOpen ? OPEN_FEE : 0;
  const insurance = Math.max(INSURANCE_RATE * productValue, INSURANCE_MIN);
  const codFee = returned ? 0 : COD_FEE_RATE * Math.max(0, cod - COD_FEE_THRESHOLD);
  const transferFee = returned ? 0 : Math.max(TRANSFER_RATE * cod, TRANSFER_MIN);
  return { cost: Math.round((openFee + codFee + transferFee + insurance) * VAT * 100) / 100 };
}
function namesShare(sysName: string, bostaName: string): boolean {
  const a = String(sysName ?? "").toLowerCase();
  const b = String(bostaName ?? "").toLowerCase().replace(/[\s.]+/g, "");
  if (!a.trim() || !b.trim()) return true;
  const tokens = a.match(/[ء-يa-z]{3,}/g) ?? [];
  if (tokens.length === 0) return true;
  return tokens.some((t) => b.includes(t));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!GUARD_KEY || url.searchParams.get("key") !== GUARD_KEY) return new Response("Unauthorized", { status: 401 });
  const dry = url.searchParams.get("dry") === "1";

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

  // وضع الفحص: بيرجّع بيانات شحنة واحدة زي ما بوسطة بترجّعها بالظبط
  // (بنستخدمه عشان نعرف بوسطة بتحسب التأمين على أنهي قيمة)
  const sample = url.searchParams.get("sample");
  if (sample) {
    const one = deliveries.find(
      (d) =>
        String(d?.trackingNumber ?? "") === sample ||
        String(d?.shopifyInfo?.orderNumber ?? "").replace("#", "") === sample ||
        String(d?.businessReference ?? "").split(":").pop()?.trim() === sample,
    );
    return new Response(
      JSON.stringify({ found: !!one, delivery: one ?? null }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // قايمة الشحنات اللي مالهاش أوردر عندنا (للمطابقة)
  const unmatchedOnly = url.searchParams.get("unmatched") === "1";

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, order_status, delivered_at, bosta_state, bosta_exception, bosta_cod, bosta_collected, bosta_tracking, bosta_shipping_cost, order_items(quantity, sale_price_at_order), customers(full_name)");
  const byNum = new Map<string, any>();
  const byTrack = new Map<string, any>();
  for (const o of orders ?? []) {
    byNum.set(String(o.order_number), o);
    if (o.bosta_tracking) byTrack.set(String(o.bosta_tracking), o);
  }

  let matched = 0, changed = 0, skippedTampered = 0, statusLocked = 0;
  const unmatched: any[] = [];
  for (const d of deliveries) {
    const tracking = d?.trackingNumber ? String(d.trackingNumber) : "";
    const rawNum = d?.shopifyInfo?.orderNumber ?? String(d?.businessReference ?? "").split(":").pop() ?? "";
    const orderNumber = String(rawNum).replace("#", "").trim();

    let o: any = null, byTracking = false;
    if (tracking && byTrack.has(tracking)) { o = byTrack.get(tracking); byTracking = true; }
    else o = byNum.get(orderNumber);
    if (!o) {
      unmatched.push({
        tracking,
        orderNumber,
        state: d?.state?.value ?? null,
        cod: Number(d?.cod ?? 0),
        receiver: d?.receiver?.fullName ?? null,
        phone: d?.receiver?.phone ?? null,
        createdAt: d?.createdAt ?? null,
        businessReference: d?.businessReference ?? null,
      });
      continue;
    }

    if (!byTracking && !namesShare(o.customers?.full_name ?? "", d?.receiver?.fullName ?? "")) {
      skippedTampered++;
      continue;
    }
    matched++;

    const state = d?.state?.value ?? null;
    const cod = Number(d?.cod ?? 0);
    const trk = d?.trackingNumber ?? null;
    const mapped = mapState(state);
    const collected = mapped === "delivered";
    const productValue = (o.order_items ?? []).reduce((s: number, it: any) => s + Number(it.quantity) * Number(it.sale_price_at_order), 0);
    // المرتجع بعد التسليم اتسلّم فعلاً — فرسوم بوسطة عليه كاملة زي المتسلّم
    const feesAsReturned = mapped === "returned" && o.order_status !== "returned_after_delivery";
    const c = bostaCost(cod, productValue, !!d?.allowToOpenPackage, feesAsReturned);

    // سبب التوقف من بوسطة (عنوان مش واضح / العميل مش بيرد...)
    const exception =
      d?.latestExceptionReason ??
      d?.state?.delayReason ??
      d?.exceptionReason ??
      null;

    const upd: Record<string, unknown> = {};
    if (o.bosta_state !== state) upd.bosta_state = state;
    if ((o.bosta_exception ?? null) !== (exception ?? null)) upd.bosta_exception = exception;
    if (Number(o.bosta_cod) !== cod) upd.bosta_cod = cod;
    if (o.bosta_collected !== collected) upd.bosta_collected = collected;
    if (o.bosta_tracking !== trk) upd.bosta_tracking = trk;
    if (Number(o.bosta_shipping_cost ?? 0) !== c.cost) upd.bosta_shipping_cost = c.cost;

    // الحالة: بنسيبها زي ما هي لو الأوردر ملغي أو معلّم "مرتجع بعد التسليم"
    if (mapped && o.order_status !== mapped) {
      if (LOCKED_STATUSES.includes(o.order_status)) {
        statusLocked++;
      } else {
        upd.order_status = mapped;
        if (mapped === "delivered" && !o.delivered_at) upd.delivered_at = new Date().toISOString();
      }
    }

    if (Object.keys(upd).length === 0) continue;
    if (!dry && !unmatchedOnly) await supabase.from("orders").update(upd).eq("id", o.id);
    changed++;
  }

  if (unmatchedOnly) {
    return new Response(
      JSON.stringify({ count: unmatched.length, unmatched }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ mode: dry ? "DRY RUN" : "تم التنفيذ", fetched: deliveries.length, matched, changed, skippedTampered, statusLocked, unmatchedCount: unmatched.length }, null, 2), { headers: { "Content-Type": "application/json" } });
});
