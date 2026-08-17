// ==========================================================================
// بوليصة الشحن (AWB) وتحديث مبلغ التحصيل
// --------------------------------------------------------------------------
// الاتنين بيشتغلوا على شحنة موجودة أصلاً، فمحتاجين خطوة واحدة قبل أي حاجة:
// نحوّل رقم التتبع اللي عندنا لرقم الشحنة عند بوسطة.
//
// **ومفتاح كل بيزنس هو اللي بيتستخدم** — زي الإرسال والمرتجع بالظبط.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAwbPdf,
  fetchDeliveryByTracking,
  updateDeliveryCod,
} from "./client";
import { computeCod } from "./build-shipment";
import { canEditDelivery } from "./order-status";
import { loadTenantCredentials } from "../tenant-settings";

type TrackedOrder = {
  id: string;
  order_number: string | number | null;
  bosta_tracking: string | null;
  tenant_id: string;
};

/** بيقرا الأوردر ومفتاح بيزنسه، وبيتأكد إن عليه شحنة أصلاً */
async function loadTracked(
  db: SupabaseClient,
  orderId: string,
  select: string
): Promise<
  | { ok: false; error: string; status: number }
  | { ok: true; order: TrackedOrder & Record<string, unknown>; apiKey: string }
> {
  const { data, error } = await db
    .from("orders")
    .select(select)
    .eq("id", orderId)
    .maybeSingle();

  if (error)
    return { ok: false, error: "معرفناش نقرا الأوردر: " + error.message, status: 500 };
  if (!data) return { ok: false, error: "الأوردر مش موجود", status: 404 };

  const order = data as unknown as TrackedOrder & Record<string, unknown>;
  if (!order.bosta_tracking) {
    return { ok: false, error: "الأوردر ده لسه مالوش شحنة عند بوسطة", status: 400 };
  }

  const creds = await loadTenantCredentials(db, order.tenant_id);
  if (!creds.bostaApiKey) {
    return { ok: false, error: "البيزنس ده لسه مربطش حساب بوسطة", status: 400 };
  }

  return { ok: true, order, apiKey: creds.bostaApiKey };
}

export type AwbResult =
  | { ok: true; pdf: Uint8Array }
  | { ok: false; error: string; status: number };

export async function runBostaAwb(opts: {
  db: SupabaseClient;
  orderId: string;
  fetchImpl?: typeof fetch;
}): Promise<AwbResult> {
  const { db, orderId, fetchImpl } = opts;

  const loaded = await loadTracked(
    db,
    orderId,
    "id, order_number, bosta_tracking, tenant_id"
  );
  if (!loaded.ok) return loaded;

  const tracking = String(loaded.order.bosta_tracking);

  let delivery;
  try {
    delivery = await fetchDeliveryByTracking(loaded.apiKey, tracking, fetchImpl);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "معرفناش نوصل لبوسطة",
      status: 502,
    };
  }

  if (!delivery) {
    return {
      ok: false,
      error: `بوسطة مالقتش شحنة برقم ${tracking}`,
      status: 404,
    };
  }

  const pdf = await fetchAwbPdf(loaded.apiKey, delivery.id, fetchImpl);
  if (!pdf) {
    // بوسطة بترفض البوليصة بعد ما الشحنة تتسلّم — ده مش عطل
    return {
      ok: false,
      error: `بوسطة مابتديش بوليصة للشحنة دي (حالتها: ${delivery.state || "مش معروفة"})`,
      status: 502,
    };
  }

  return { ok: true, pdf };
}

// ==========================================================================
// تحديث مبلغ التحصيل عند بوسطة بعد تعديل الأوردر
// ==========================================================================

const COD_FIELDS = `id, order_number, bosta_tracking, tenant_id, discount, shipping_price, amount_paid,
  order_items(quantity, sale_price_at_order)`;

export type UpdateCodResult =
  | { ok: true; changed: false; reason: string }
  | { ok: true; changed: true; cod: number; was: number | null }
  | { ok: false; error: string };

export async function runBostaUpdateCod(opts: {
  db: SupabaseClient;
  orderId: string;
  dry?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<UpdateCodResult> {
  const { db, orderId, dry = false, fetchImpl } = opts;

  const loaded = await loadTracked(db, orderId, COD_FIELDS);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const order = loaded.order as TrackedOrder & {
    discount: number | null;
    shipping_price: number | null;
    amount_paid: number | null;
    order_items: { quantity: number; sale_price_at_order: number }[] | null;
  };

  const items = order.order_items ?? [];
  // نفس حسبة الإرسال بالظبط — **مصدر واحد**. لو الاتنين اتفرقوا، التحديث
  // بيبعت لبوسطة رقم غير اللي الشحنة اتعملت بيه والمندوب بيحصّل غلط.
  const cod = computeCod({
    items: items.map((i) => ({
      quantity: i.quantity,
      salePrice: i.sale_price_at_order,
      productName: null,
    })),
    discount: order.discount,
    shippingPrice: order.shipping_price,
    amountPaid: order.amount_paid,
  });
  const itemsCount = items.reduce((s, i) => s + Number(i.quantity), 0);

  let delivery;
  try {
    delivery = await fetchDeliveryByTracking(
      loaded.apiKey,
      String(order.bosta_tracking),
      fetchImpl
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "معرفناش نوصل لبوسطة",
    };
  }

  if (!delivery) return { ok: false, error: "بوسطة مالقتش الشحنة" };

  // بوسطة نفسها بتقولنا مقفول ولا لأ — ده أدق من التخمين من اسم الحالة،
  // فبناخد كلامها الأول ونرجع للحالة بس لو مابعتتهاش
  const blocked =
    delivery.codUpdateBlocked ?? !canEditDelivery(delivery.state);

  if (blocked) {
    return {
      ok: true,
      changed: false,
      reason: `بوسطة قافلة تعديل التحصيل للشحنة دي (${delivery.state})`,
    };
  }

  if (delivery.cod === cod) {
    return { ok: true, changed: false, reason: "التحصيل مطابق أصلاً" };
  }

  if (dry) {
    return { ok: true, changed: true, cod, was: delivery.cod };
  }

  const res = await updateDeliveryCod(
    loaded.apiKey,
    delivery.id,
    cod,
    itemsCount,
    fetchImpl
  );
  if (!res.ok) {
    return { ok: false, error: res.message || `بوسطة رفضت التعديل (${res.status})` };
  }

  // ⚠️ **الرقم اللي بعتناه بيتحفظ هنا كمان.**
  //
  // `bosta_cod` بتتكتب فوقها من المزامنة برقم بوسطة، وبوسطة **بتصفّرها بعد
  // التسوية** — فالسؤال «الشحنة دي اتبعتت بكام؟» كان بيفضل من غير إجابة.
  //
  // وسجل بوسطة بيسجّل **قيمة الإنشاء بس**؛ التعديل اللي بنبعته إحنا
  // مابيتسجّلش عندها. فمن غير السطر ده، أي تعديل تحصيل بيضيع أثره تمامًا.
  //
  // الفشل هنا مايرجّعش خطأ: بوسطة خدت التعديل خلاص، ومينفعش نقول للمستخدم
  // إنه فشل عشان خانة عندنا ماتكتبتش.
  try {
    await db
      .from("orders")
      .update({ bosta_cod_sent: cod })
      .eq("tenant_id", order.tenant_id)
      .eq("id", orderId);
  } catch {
    // `sql/cod-sent.sql` لسه ماتشغّلش — التعديل عند بوسطة تم بردو
  }

  return { ok: true, changed: true, cod, was: delivery.cod };
}
