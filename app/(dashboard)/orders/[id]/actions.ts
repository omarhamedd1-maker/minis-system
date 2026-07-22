"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, getSessionUser, requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { ORDER_STATUS_OPTIONS, orderStatusBadge } from "@/lib/format";

type Supa = ReturnType<typeof createAdminClient>;

// بعد أي تعديل بنود: نبعت التعديل لشوبيفاي في الخلفية (بعد ما الرد يوصل المستخدم)
// عشان المنتج يظهر فوراً من غير ما يستنى المزامنة
function pushOrderToShopify(orderId: string) {
  const key = process.env.SYNC_KEY;
  if (!key) return;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  after(async () => {
    // شوبيفاي: تحديث البنود/السعر
    try {
      await fetch(
        `${base}/functions/v1/shopify-order-push?key=${key}&order=${orderId}`,
        { method: "GET", signal: AbortSignal.timeout(20000) }
      );
    } catch {
      // فشل الدفع لشوبيفاي ما يوقفش التعديل المحلي (مثلاً أوردر متشحن)
    }
    // بوسطة: تحديث مبلغ التحصيل (طول ما الشحنة لسه ماتاخدتش)
    try {
      await fetch(
        `${base}/functions/v1/bosta-update?key=${key}&order=${orderId}`,
        { method: "GET", signal: AbortSignal.timeout(20000) }
      );
    } catch {
      // فشل تحديث بوسطة ما يوقفش التعديل المحلي
    }
  });
}

// بيجيب رقم الأوردر عشان نكتبه في سجل النشاط
async function orderNo(supabase: Supa, orderId: string): Promise<string> {
  const { data } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();
  return data?.order_number ?? "";
}

// بيظبط المخزون ويسجّل الحركة. change موجب = رجوع للمخزون، سالب = خصم
async function adjustStock(
  supabase: Supa,
  variantId: string | null,
  change: number,
  orderId: string,
  reason: string
) {
  if (!variantId || change === 0) return;
  const { data: v } = await supabase
    .from("product_variants")
    .select("quantity_on_hand")
    .eq("id", variantId)
    .maybeSingle();
  if (!v) return;
  await supabase
    .from("product_variants")
    .update({ quantity_on_hand: v.quantity_on_hand + change })
    .eq("id", variantId);
  await supabase.from("stock_movements").insert({
    variant_id: variantId,
    change_quantity: change,
    reason,
    related_order_id: orderId,
  });
}

export async function addOrderItem(formData: FormData) {
  const me = await requirePermission("orders.items");
  const orderId = String(formData.get("order_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "");
  const quantity = Number(formData.get("quantity"));
  const rawPrice = formData.get("sale_price");

  if (!orderId || !variantId || !Number.isInteger(quantity) || quantity <= 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("اختار منتج وكمية صحيحة")
    );
  }

  const supabase = createAdminClient();

  const { data: variant } = await supabase
    .from("product_variants")
    .select("cost_price, sale_price")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) {
    redirect(`/orders/${orderId}?error=` + encodeURIComponent("المنتج ده مش موجود"));
  }

  const salePrice =
    rawPrice != null && String(rawPrice).trim() !== ""
      ? Number(rawPrice)
      : variant.sale_price;
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    redirect(`/orders/${orderId}?error=` + encodeURIComponent("السعر مش صحيح"));
  }

  // لو المنتج موجود أصلاً في الأوردر نزوّد كميته بدل ما نكرّره (يمنع تضخّم الكمية مع المزامنة)
  const { data: existingItem } = await supabase
    .from("order_items")
    .select("id, quantity")
    .eq("order_id", orderId)
    .eq("variant_id", variantId)
    .maybeSingle();

  const { error } = existingItem
    ? await supabase
        .from("order_items")
        .update({ quantity: existingItem.quantity + quantity })
        .eq("id", existingItem.id)
    : await supabase.from("order_items").insert({
        order_id: orderId,
        variant_id: variantId,
        quantity,
        sale_price_at_order: salePrice,
        cost_price_at_order: variant.cost_price,
      });

  if (error) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نضيف المنتج: " + error.message)
    );
  }

  // خصم من المخزون
  await adjustStock(supabase, variantId, -quantity, orderId, "إضافة منتج لأوردر");

  await pushOrderToShopify(orderId);
  await logActivity(me, "order.items", `أضاف منتج لأوردر ${await orderNo(supabase, orderId)}`);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/products");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function deleteOrderItem(formData: FormData) {
  const me = await requirePermission("orders.items");
  const orderId = String(formData.get("order_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");

  if (!orderId || !itemId) {
    redirect(`/orders/${orderId}`);
  }

  const supabase = createAdminClient();

  // نجيب بيانات البند قبل المسح عشان نرجّع مخزونه
  const { data: item } = await supabase
    .from("order_items")
    .select("variant_id, quantity")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .maybeSingle();

  const { error, count } = await supabase
    .from("order_items")
    .delete({ count: "exact" })
    .eq("id", itemId)
    .eq("order_id", orderId);

  if (error || count === 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نمسح المنتج — اتأكد إن عندك صلاحية تعديل")
    );
  }

  // نرجّع المخزون
  if (item) {
    await adjustStock(
      supabase,
      item.variant_id,
      item.quantity,
      orderId,
      "مسح منتج من أوردر"
    );
  }

  await pushOrderToShopify(orderId);
  await logActivity(me, "order.items", `مسح منتج من أوردر ${await orderNo(supabase, orderId)}`);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/products");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function updateOrderItem(formData: FormData) {
  const me = await requirePermission("orders.items");
  const orderId = String(formData.get("order_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const quantity = Number(formData.get("quantity"));
  const salePrice = Number(formData.get("sale_price"));

  if (
    !orderId ||
    !itemId ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(salePrice) ||
    salePrice < 0
  ) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("الكمية لازم رقم صحيح أكبر من صفر والسعر رقم موجب")
    );
  }

  const supabase = createAdminClient();

  // نجيب الكمية القديمة عشان نظبط فرق المخزون
  const { data: oldItem } = await supabase
    .from("order_items")
    .select("variant_id, quantity")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .maybeSingle();

  const { error, count } = await supabase
    .from("order_items")
    .update(
      { quantity, sale_price_at_order: salePrice },
      { count: "exact" }
    )
    .eq("id", itemId)
    .eq("order_id", orderId);

  if (error || count === 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نحفظ البند — اتأكد إن عندك صلاحية تعديل")
    );
  }

  // فرق الكمية: زيادة = خصم أكتر، نقصان = رجوع للمخزون
  if (oldItem) {
    const delta = quantity - oldItem.quantity;
    await adjustStock(
      supabase,
      oldItem.variant_id,
      -delta,
      orderId,
      "تعديل كمية بند في أوردر"
    );
  }

  await pushOrderToShopify(orderId);
  await logActivity(me, "order.items", `عدّل كمية بند في أوردر ${await orderNo(supabase, orderId)}`);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/products");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function updateDiscount(formData: FormData) {
  const me = await requirePermission("orders.items");
  const orderId = String(formData.get("order_id") ?? "");
  const mode = String(formData.get("discount_mode") ?? "amount");
  const value = Number(formData.get("discount_value"));
  const itemsTotal = Number(formData.get("items_total"));

  if (!orderId || !Number.isFinite(value) || value < 0) {
    redirect(
      `/orders/${orderId}?error=` + encodeURIComponent("قيمة الخصم مش صحيحة")
    );
  }

  // لو نسبة: نحولها لمبلغ من إجمالي المنتجات
  let discount = value;
  if (mode === "percent") {
    if (value > 100) {
      redirect(
        `/orders/${orderId}?error=` +
          encodeURIComponent("نسبة الخصم مينفعش تعدي 100%")
      );
    }
    discount = Math.round((itemsTotal * value) / 100);
  }

  if (Number.isFinite(itemsTotal) && discount > itemsTotal) {
    discount = itemsTotal;
  }

  const supabase = createAdminClient();

  const { error, count } = await supabase
    .from("orders")
    .update({ discount }, { count: "exact" })
    .eq("id", orderId);

  if (error || count === 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نحفظ الخصم — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await pushOrderToShopify(orderId);
  await logActivity(me, "order.discount", `غيّر خصم أوردر ${await orderNo(supabase, orderId)} لـ ${discount}`);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

// تحديث الحالة من قايمة الأوردرات من غير redirect — عشان الصفحة ماترجعش لفوق
export async function updateOrderStatusInline(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  const status = String(formData.get("status") ?? "");

  const isValidStatus = ORDER_STATUS_OPTIONS.some((o) => o.value === status);
  if (!orderId || !isValidStatus) return;

  const me = await getSessionUser();
  if (!can(me, "orders.status")) return;

  const supabase = createAdminClient();
  const updateData: {
    order_status: string;
    delivered_at?: string | null;
    cancelled_at?: string | null;
  } = {
    order_status: status,
    delivered_at: status === "delivered" ? new Date().toISOString() : null,
    cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
  };
  await supabase.from("orders").update(updateData).eq("id", orderId);

  await logActivity(
    me,
    "order.status",
    `غيّر حالة أوردر ${await orderNo(supabase, orderId)} لـ ${orderStatusBadge(status).label}`
  );
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function bulkUpdateStatus(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const orderIds = formData.getAll("order_ids").map(String).filter(Boolean);
  const status = String(formData.get("status") ?? "");

  const isValidStatus = ORDER_STATUS_OPTIONS.some((o) => o.value === status);
  if (orderIds.length === 0 || !isValidStatus) {
    return { ok: false, error: "اختار أوردرات وحالة صحيحة" };
  }

  const me = await getSessionUser();
  if (!can(me, "orders.status")) {
    return { ok: false, error: "مالكش صلاحية تغيير حالة الأوردرات" };
  }

  const supabase = createAdminClient();

  const update: {
    order_status: string;
    delivered_at?: string | null;
    cancelled_at?: string | null;
  } = {
    order_status: status,
  };
  update.delivered_at = status === "delivered" ? new Date().toISOString() : null;
  update.cancelled_at = status === "cancelled" ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("orders")
    .update(update)
    .in("id", orderIds);

  if (error) {
    return {
      ok: false,
      error: "معرفناش نحفظ الحالة — اتأكد إن عندك صلاحية تعديل",
    };
  }

  await logActivity(
    me,
    "order.status",
    `غيّر حالة ${orderIds.length} أوردر لـ ${orderStatusBadge(status).label}`
  );
  revalidatePath("/orders");
  return { ok: true };
}

export async function addOrderComment(formData: FormData) {
  const me = await requirePermission("orders.comments");
  const orderId = String(formData.get("order_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!orderId || !body) {
    redirect("/orders?error=" + encodeURIComponent("اكتب التعليق الأول"));
  }

  const supabase = createAdminClient();

  // اسم كاتب التعليق من بيانات المستخدم الحالي
  const authorName = me.fullName || me.email || "غير معروف";

  const { error } = await supabase.from("order_comments").insert({
    order_id: orderId,
    author_name: authorName,
    body,
  });

  if (error) {
    redirect(
      "/orders?error=" +
        encodeURIComponent("معرفناش نسجل التعليق: " + error.message)
    );
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  redirect("/orders");
}

export async function deleteOrderComment(formData: FormData) {
  await requirePermission("orders.comments");
  const commentId = String(formData.get("comment_id") ?? "");
  if (!commentId) {
    redirect("/orders");
  }

  const supabase = createAdminClient();

  const { error, count } = await supabase
    .from("order_comments")
    .delete({ count: "exact" })
    .eq("id", commentId);

  if (error || count === 0) {
    redirect(
      "/orders?error=" +
        encodeURIComponent("معرفناش نمسح التعليق — اتأكد إن عندك صلاحية")
    );
  }

  revalidatePath("/orders");
  redirect("/orders");
}

export async function updateShippingPrice(formData: FormData) {
  const me = await requirePermission("orders.items");
  const orderId = String(formData.get("order_id") ?? "");
  const shippingPrice = Number(formData.get("shipping_price"));

  if (!orderId || !Number.isFinite(shippingPrice) || shippingPrice < 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("سعر الشحن لازم يكون رقم موجب")
    );
  }

  const supabase = createAdminClient();

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

  await logActivity(me, "order.shipping", `غيّر شحن أوردر ${await orderNo(supabase, orderId)} لـ ${shippingPrice}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function toggleOrderArchive(formData: FormData) {
  await requirePermission("orders.archive");
  const orderId = String(formData.get("order_id") ?? "");
  const archive = formData.get("archive") === "1";
  if (!orderId) {
    redirect("/orders");
  }

  const supabase = createAdminClient();

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

// المسح الفعلي للأوردر (بيرجّع المخزون). بيرجّع نتيجة من غير تحويل — عشان يتنادى
// من المسح المباشر (أدمن) ومن الموافقة على طلب المسح.
async function performOrderDeletion(
  orderId: string
): Promise<{ ok: boolean; error?: string; orderNumber?: string }> {
  const supabase = createAdminClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("order_number, order_items(variant_id, quantity)")
    .eq("id", orderId)
    .maybeSingle()
    .overrideTypes<{
      order_number: string | null;
      order_items: { variant_id: string | null; quantity: number }[];
    }>();

  if (fetchError || !order) return { ok: false, error: "الأوردر ده مش موجود" };

  const orderNumber = order.order_number ?? "";
  const fail = (step: string, message: string) => ({
    ok: false as const,
    error: `معرفناش نمسح الأوردر (${step}): ${message}`,
  });

  const { data: orderMovements } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("related_order_id", orderId)
    .limit(1);
  const hadStockMovements = (orderMovements ?? []).length > 0;

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
      if (stockError) return fail("المخزون", stockError.message);
      const { error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          variant_id: item.variant_id,
          change_quantity: item.quantity,
          reason: `مسح أوردر ${orderNumber}`.trim(),
        });
      if (movementError) return fail("سجل المخزون", movementError.message);
    }
  }

  const { error: unlinkError } = await supabase
    .from("stock_movements")
    .update({ related_order_id: null })
    .eq("related_order_id", orderId);
  if (unlinkError) return fail("سجل المخزون", unlinkError.message);

  const { error: cashError } = await supabase
    .from("cash_transactions")
    .delete()
    .eq("related_order_id", orderId);
  if (cashError) return fail("الخزنة", cashError.message);

  const { error: shipmentsError } = await supabase
    .from("shipments")
    .delete()
    .eq("order_id", orderId);
  if (shipmentsError) return fail("الشحنات", shipmentsError.message);

  const { error: itemsError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);
  if (itemsError) return fail("بنود الأوردر", itemsError.message);

  const { error: orderError, count } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .eq("id", orderId);
  if (orderError || count === 0) {
    return fail("الأوردر", orderError?.message ?? "اتأكد إن عندك صلاحية");
  }

  return { ok: true, orderNumber };
}

export async function deleteOrder(formData: FormData) {
  const me = await requirePermission("orders.delete");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) {
    redirect("/orders");
  }

  const supabase = createAdminClient();

  // الأدمن بيمسح على طول
  if (me.isAdmin) {
    const result = await performOrderDeletion(orderId);
    if (!result.ok) {
      redirect(`/orders/${orderId}?error=` + encodeURIComponent(result.error ?? "خطأ"));
    }
    await logActivity(me, "order.delete", `مسح أوردر ${result.orderNumber ?? ""}`.trim());
    revalidatePath("/orders");
    redirect("/orders?deleted=1");
  }

  // غير الأدمن: بيعمل طلب حذف يوافق عليه الأدمن (مبدأ الشخصين)
  const { data: order } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();

  // منع تكرار الطلب لنفس الأوردر
  const { data: existing } = await supabase
    .from("deletion_requests")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("فيه طلب حذف للأوردر ده بالفعل مستني موافقة الأدمن")
    );
  }

  const { error: reqError } = await supabase.from("deletion_requests").insert({
    order_id: orderId,
    order_number: order?.order_number ?? null,
    requested_by_id: me.authUserId,
    requested_by_name: me.fullName ?? me.email ?? "غير معروف",
    status: "pending",
  });
  if (reqError) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نسجّل طلب الحذف — كلّم الأدمن")
    );
  }

  await logActivity(
    me,
    "order.delete_request",
    `طلب حذف أوردر ${order?.order_number ?? ""}`.trim()
  );
  revalidatePath("/orders");
  redirect(
    `/orders/${orderId}?saved=` +
      encodeURIComponent("اتبعت طلب حذف للأدمن — هيتمسح بعد موافقته")
  );
}

// الأدمن بيوافق على طلب الحذف فيتم المسح فعلاً
export async function approveDeletion(formData: FormData) {
  const me = await requirePermission("orders.delete");
  if (!me.isAdmin) {
    redirect("/orders?error=" + encodeURIComponent("الموافقة على الحذف للأدمن بس"));
  }
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) redirect("/orders");

  const admin = createAdminClient();
  const { data: reqRow } = await admin
    .from("deletion_requests")
    .select("order_id, order_number, status")
    .eq("id", requestId)
    .maybeSingle()
    .overrideTypes<{ order_id: string; order_number: string | null; status: string }>();
  if (!reqRow || reqRow.status !== "pending") {
    redirect("/orders?error=" + encodeURIComponent("الطلب مش موجود أو اتقفل خلاص"));
  }

  const result = await performOrderDeletion(reqRow!.order_id);
  if (!result.ok) {
    redirect("/orders?error=" + encodeURIComponent(result.error ?? "خطأ"));
  }

  await admin
    .from("deletion_requests")
    .update({
      status: "approved",
      resolved_by: me.fullName ?? me.email ?? "أدمن",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  await logActivity(
    me,
    "order.delete",
    `وافق على حذف أوردر ${reqRow!.order_number ?? ""}`.trim()
  );
  revalidatePath("/orders");
  redirect("/orders?deleted=1");
}

// الأدمن بيرفض طلب الحذف
export async function rejectDeletion(formData: FormData) {
  const me = await requirePermission("orders.delete");
  if (!me.isAdmin) {
    redirect("/orders?error=" + encodeURIComponent("رفض الحذف للأدمن بس"));
  }
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) redirect("/orders");

  const admin = createAdminClient();
  const { data: reqRow } = await admin
    .from("deletion_requests")
    .select("order_number")
    .eq("id", requestId)
    .maybeSingle();

  await admin
    .from("deletion_requests")
    .update({
      status: "rejected",
      resolved_by: me.fullName ?? me.email ?? "أدمن",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending");

  await logActivity(
    me,
    "order.delete_reject",
    `رفض حذف أوردر ${reqRow?.order_number ?? ""}`.trim()
  );
  revalidatePath("/orders");
  redirect("/orders?saved=" + encodeURIComponent("اترفض طلب الحذف"));
}

// ربط شحنة بوسطة موجودة بالأوردر ده يدوياً (لإعادة استخدام شحنة عميل لغى)
export async function linkBostaShipment(formData: FormData) {
  const me = await requirePermission("ship.link");
  const orderId = String(formData.get("order_id") ?? "");
  const tracking = String(formData.get("tracking") ?? "").replace(/\D/g, "").trim();

  if (!orderId || !tracking) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("اكتب رقم التتبع الأول")
    );
  }

  const supabase = createAdminClient();

  // نتأكد إن رقم التتبع ده مش مربوط بأوردر تاني
  const { data: other } = await supabase
    .from("orders")
    .select("order_number")
    .eq("bosta_tracking", tracking)
    .neq("id", orderId)
    .maybeSingle();
  if (other) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent(
          `رقم التتبع ده مربوط بأوردر تاني (${other.order_number}) — فكّه منه الأول`
        )
    );
  }

  // نربط التتبع بالأوردر ونخليه "جاري الشحن" — والمزامنة هتجيب باقي التفاصيل
  const { error, count } = await supabase
    .from("orders")
    .update(
      { bosta_tracking: tracking, order_status: "shipped", cancelled_at: null },
      { count: "exact" }
    )
    .eq("id", orderId);

  if (error || count === 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نربط الشحنة — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await logActivity(me, "bosta.link", `ربط شحنة ${tracking} بأوردر ${await orderNo(supabase, orderId)}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function updateOrderStatus(formData: FormData) {
  const me = await requirePermission("orders.status");
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

  const supabase = createAdminClient();

  // نسجل تاريخ التسليم/الإلغاء مع الحالة — عشان تحصيل اليوم وقفل الملغي يتحسبوا صح
  const updateData: {
    order_status: string;
    delivered_at?: string | null;
    cancelled_at?: string | null;
  } = {
    order_status: status,
  };
  updateData.delivered_at =
    status === "delivered" ? new Date().toISOString() : null;
  updateData.cancelled_at =
    status === "cancelled" ? new Date().toISOString() : null;

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

  const { data: o } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();
  await logActivity(
    me,
    "order.status",
    `غيّر حالة أوردر ${o?.order_number ?? ""} لـ ${orderStatusBadge(status).label}`.trim()
  );

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(returnTo + joiner + "saved=1");
}

// إرسال الأوردر لبوسطة كشحنة (أوتوماتيك) — بننادي دالة bosta-create
export async function sendOrderToBosta(formData: FormData) {
  const me = await requirePermission("ship.send");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/orders");

  const key = process.env.SYNC_KEY;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !base) {
    redirect(
      `/orders/${orderId}?error=` + encodeURIComponent("إعدادات الإرسال ناقصة")
    );
  }

  let ok = false;
  let message = "معرفناش نبعت الشحنة لبوسطة";
  try {
    const res = await fetch(
      `${base}/functions/v1/bosta-create?key=${key}&order=${orderId}`,
      { method: "GET", signal: AbortSignal.timeout(30000) }
    );
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      ok = true;
    } else if (data?.error) {
      // رسالة الخطأ اللي رجّعتها الدالة (زي: معرفناش نحدد المدينة)
      message = String(data.error);
    }
  } catch {
    message = "الاتصال ببوسطة فشل — جرّب تاني";
  }

  if (ok) {
    await logActivity(me, "bosta.send", `بعت أوردر لبوسطة كشحنة`);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(
    ok
      ? `/orders/${orderId}?saved=1`
      : `/orders/${orderId}?error=` + encodeURIComponent(message)
  );
}

// إرسال أكتر من أوردر لبوسطة مرة واحدة — بنرجّع ملخّص (اتبعت/اتخطّى/فشل)
export async function bulkSendToBosta(formData: FormData): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
  details?: string;
}> {
  const me = await getSessionUser();
  if (!can(me, "ship.send")) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, error: "مالكش صلاحية الإرسال لبوسطة" };
  }

  const orderIds = formData
    .getAll("order_ids")
    .map(String)
    .filter(Boolean)
    .slice(0, 30); // حد أقصى للدفعة الواحدة
  if (orderIds.length === 0) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, error: "محددتش أي أوردر" };
  }

  const key = process.env.SYNC_KEY;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !base) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, error: "إعدادات الإرسال ناقصة" };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const failMsgs: string[] = [];

  async function sendOne(id: string) {
    try {
      const res = await fetch(
        `${base}/functions/v1/bosta-create?key=${key}&order=${id}`,
        { signal: AbortSignal.timeout(30000) }
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        if (data.already) skipped++;
        else sent++;
      } else {
        failed++;
        if (data?.error) failMsgs.push(String(data.error));
      }
    } catch {
      failed++;
    }
  }

  // بالدفعات (4 مع بعض) عشان ميطولش
  const CONCURRENCY = 4;
  for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
    await Promise.all(orderIds.slice(i, i + CONCURRENCY).map(sendOne));
  }

  if (sent > 0) {
    await logActivity(me, "bosta.send", `بعت ${sent} أوردر لبوسطة كشحنات`);
  }
  revalidatePath("/orders");
  const details = [...new Set(failMsgs)].slice(0, 3).join(" — ");
  return { ok: true, sent, skipped, failed, details };
}
