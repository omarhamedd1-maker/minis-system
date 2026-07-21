"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUS_OPTIONS } from "@/lib/format";

type Supa = Awaited<ReturnType<typeof createClient>>;

// بعد أي تعديل بنود: نبعت التعديل لشوبيفاي تلقائياً (بيشتغل بس قبل الشحن)
async function pushOrderToShopify(orderId: string) {
  const key = process.env.SYNC_KEY;
  if (!key) return;
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/shopify-order-push?key=${key}&order=${orderId}`,
      { method: "GET", signal: AbortSignal.timeout(15000) }
    );
  } catch {
    // فشل الدفع لشوبيفاي ما يوقفش التعديل المحلي (مثلاً أوردر متشحن)
  }
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

  const supabase = await createClient();

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

  const { error } = await supabase.from("order_items").insert({
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

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/products");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function deleteOrderItem(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");

  if (!orderId || !itemId) {
    redirect(`/orders/${orderId}`);
  }

  const supabase = await createClient();

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

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/products");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function updateOrderItem(formData: FormData) {
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

  const supabase = await createClient();

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

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/products");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function updateDiscount(formData: FormData) {
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

  const supabase = await createClient();

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

  const supabase = await createClient();
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

  const supabase = await createClient();

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

  revalidatePath("/orders");
  return { ok: true };
}

export async function addOrderComment(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!orderId || !body) {
    redirect("/orders?error=" + encodeURIComponent("اكتب التعليق الأول"));
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // اسم كاتب التعليق من جدول المستخدمين، ولو مش موجود نستخدم الإيميل
  const { data: appUser } = await supabase
    .from("app_users")
    .select("full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const authorName = appUser?.full_name || user.email || "غير معروف";

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
  const commentId = String(formData.get("comment_id") ?? "");
  if (!commentId) {
    redirect("/orders");
  }

  const supabase = await createClient();

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

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(returnTo + joiner + "saved=1");
}
