"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_OPTIONS } from "@/lib/format";

export async function updateShippingPrice(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  const shippingPrice = Number(formData.get("shipping_price"));

  if (!orderId || !Number.isFinite(shippingPrice) || shippingPrice < 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("سعر الشحن لازم يكون رقم موجب")
    );
  }

  const supabase = await createClient();

  const { error, count } = await supabase
    .from("orders")
    .update({ shipping_price: shippingPrice }, { count: "exact" })
    .eq("id", orderId);

  if (error || count === 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نحفظ سعر الشحن — اتأكد إن عندك صلاحية تعديل")
    );
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function toggleOrderArchive(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  const archive = formData.get("archive") === "1";
  if (!orderId) {
    redirect("/orders");
  }

  const supabase = await createClient();

  const { error, count } = await supabase
    .from("orders")
    .update({ archived: archive }, { count: "exact" })
    .eq("id", orderId);

  if (error || count === 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نغير الأرشفة — اتأكد إن عندك صلاحية تعديل")
    );
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?saved=1`);
}

export async function deleteOrder(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) {
    redirect("/orders");
  }

  const supabase = await createClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("order_number, order_items(variant_id, quantity)")
    .eq("id", orderId)
    .maybeSingle()
    .overrideTypes<{
      order_number: string | null;
      order_items: { variant_id: string | null; quantity: number }[];
    }>();

  if (fetchError || !order) {
    redirect(
      `/orders/${orderId}?error=` + encodeURIComponent("الأوردر ده مش موجود")
    );
  }

  const fail = (step: string, message: string) => {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent(`معرفناش نمسح الأوردر (${step}): ${message}`)
    );
  };

  // الأوردرات القديمة اللي اتسجلت من غير خصم مخزون ملهاش حركات — فمنرجعش ليها مخزون
  const { data: orderMovements } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("related_order_id", orderId)
    .limit(1);
  const hadStockMovements = (orderMovements ?? []).length > 0;

  // 1) نرجّع المخزون اللي الأوردر خصمه، ونسجل حركة تعويضية في السجل
  for (const item of hadStockMovements ? order.order_items : []) {
    if (!item.variant_id || item.quantity <= 0) continue;

    const { data: variant } = await supabase
      .from("product_variants")
      .select("quantity_on_hand")
      .eq("id", item.variant_id)
      .maybeSingle();

    if (variant) {
      const { error: stockError } = await supabase
        .from("product_variants")
        .update({ quantity_on_hand: variant.quantity_on_hand + item.quantity })
        .eq("id", item.variant_id);
      if (stockError) fail("المخزون", stockError.message);

      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          variant_id: item.variant_id,
          change_quantity: item.quantity,
          reason: `مسح أوردر ${order.order_number ?? ""}`.trim(),
        });
      if (movementError) fail("سجل المخزون", movementError.message);
    }
  }

  // 2) نفك ربط حركات المخزون القديمة بالأوردر (تفضل في السجل للتاريخ)
  const { error: unlinkError } = await supabase
    .from("stock_movements")
    .update({ related_order_id: null })
    .eq("related_order_id", orderId);
  if (unlinkError) fail("سجل المخزون", unlinkError.message);

  // 3) نمسح اللي مرتبط بالأوردر ثم الأوردر نفسه
  const { error: cashError } = await supabase
    .from("cash_transactions")
    .delete()
    .eq("related_order_id", orderId);
  if (cashError) fail("الخزنة", cashError.message);

  const { error: shipmentsError } = await supabase
    .from("shipments")
    .delete()
    .eq("order_id", orderId);
  if (shipmentsError) fail("الشحنات", shipmentsError.message);

  const { error: itemsError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);
  if (itemsError) fail("بنود الأوردر", itemsError.message);

  const { error: orderError, count } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .eq("id", orderId);
  if (orderError || count === 0) {
    fail("الأوردر", orderError?.message ?? "اتأكد إن عندك صلاحية تعديل");
  }

  revalidatePath("/orders");
  redirect("/orders?deleted=1");
}

export async function updateOrderStatus(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const rawReturnTo = String(formData.get("return_to") ?? "");
  // نقبل فقط مسارات داخلية تبدأ بـ /orders عشان محدش يلعب في قيمة الرجوع
  const returnTo = rawReturnTo.startsWith("/orders")
    ? rawReturnTo
    : `/orders/${orderId}`;
  const joiner = returnTo.includes("?") ? "&" : "?";

  const isValidStatus = ORDER_STATUS_OPTIONS.some(
    (option) => option.value === status
  );
  if (!orderId || !isValidStatus) {
    redirect(
      returnTo + joiner + "error=" + encodeURIComponent("الحالة المختارة مش صحيحة")
    );
  }

  const supabase = await createClient();

  // نسجل تاريخ التسليم مع الحالة — عشان تحصيل اليوم يتحسب صح
  const updateData: { order_status: string; delivered_at?: string | null } = {
    order_status: status,
  };
  if (status === "delivered") {
    updateData.delivered_at = new Date().toISOString();
  } else {
    updateData.delivered_at = null;
  }

  const { error, count } = await supabase
    .from("orders")
    .update(updateData, { count: "exact" })
    .eq("id", orderId);

  if (error || count === 0) {
    redirect(
      returnTo +
        joiner +
        "error=" +
        encodeURIComponent("معرفناش نحفظ الحالة — اتأكد إن عندك صلاحية تعديل")
    );
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(returnTo + joiner + "saved=1");
}
