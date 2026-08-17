// ============================================
// Minis System — Bosta Webhook Receiver
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_KEY = Deno.env.get("BOSTA_WEBHOOK_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// تحويل حالة بوسطة لحالة أوردر عندنا
function mapToOrderStatus(state: string): string | null {
  const s = state.toLowerCase();
  if (s.includes("out for delivery")) return "shipped";
  if (s.includes("deliver")) return "delivered";
  if (s.includes("return")) return "returned";
  if (
    s.includes("pick") ||
    s.includes("transit") ||
    s.includes("hub") ||
    s.includes("heading") ||
    s.includes("received")
  ) {
    return "shipped";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  if (!WEBHOOK_KEY || url.searchParams.get("key") !== WEBHOOK_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  const raw = await req.text();
  console.log("Bosta payload:", raw);

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const trackingNumber = String(
    payload.trackingNumber ??
      payload.tracking_number ??
      payload?.delivery?.trackingNumber ??
      ""
  );
  const stateValue =
    payload.state?.value ??
    (typeof payload.state === "string" ? payload.state : null) ??
    payload.status ??
    payload?.delivery?.state?.value ??
    null;
  const businessReference = String(
    payload.businessReference ??
      payload.business_reference ??
      payload?.delivery?.businessReference ??
      ""
  );

  if (!trackingNumber) {
    console.log("No tracking number found in payload");
    return new Response("No tracking number", { status: 200 });
  }

  const stateText = stateValue ? String(stateValue) : null;
  const mappedOrderStatus = stateText ? mapToOrderStatus(stateText) : null;

  // تحديث حالة الأوردر المرتبط (من غير ما نلمس الملغي)
  async function updateOrderStatus(orderId: string) {
    if (!mappedOrderStatus) return;
    const { data: order } = await supabase
      .from("orders")
      .select("order_status")
      .eq("id", orderId)
      .maybeSingle();
      if (order && order.order_status !== "cancelled") {
      await supabase
        .from("orders")
        .update({
          order_status: mappedOrderStatus,
          delivered_at:
            mappedOrderStatus === "delivered" ? new Date().toISOString() : null,
        })
        .eq("id", orderId);
    }
  }

  try {
    const { data: shipment } = await supabase
      .from("shipments")
      .select("id, order_id")
      .eq("bosta_tracking_number", trackingNumber)
      .maybeSingle();

    if (shipment) {
      await supabase
        .from("shipments")
        .update({
          shipping_status: stateText,
          last_update: new Date().toISOString(),
        })
        .eq("id", shipment.id);
      if (shipment.order_id) await updateOrderStatus(shipment.order_id);
      return new Response("Updated", { status: 200 });
    }

    let orderId: string | null = null;
    if (businessReference) {
      const cleanRef = businessReference.replace(/^#/, "");
      const { data: order } = await supabase
        .from("orders")
        .select("id")
        .eq("order_number", cleanRef)
        .maybeSingle();
      if (order) orderId = order.id;
    }

    if (orderId) {
      await supabase.from("shipments").insert({
        order_id: orderId,
        bosta_tracking_number: trackingNumber,
        shipping_status: stateText,
        last_update: new Date().toISOString(),
      });
      await updateOrderStatus(orderId);
      return new Response("Created", { status: 200 });
    }

    console.log("No match for tracking:", trackingNumber, "ref:", businessReference);
    return new Response("No match (logged)", { status: 200 });
  } catch (err) {
    console.error("Bosta webhook error:", err);
    return new Response("Error: " + String(err), { status: 500 });
  }
});