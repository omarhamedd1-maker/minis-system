"use server";

import { isReturnReason, returnReasonLabel } from "@/lib/return-reasons";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, getSessionUser, requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import {
  loadBostaCities,
  runBostaCreate,
  runBostaExchange,
  runBostaReturn,
} from "@/lib/bosta/create";
import { runBostaUpdateCod } from "@/lib/bosta/awb";
import { runShopifyOrderPush } from "@/lib/shopify/order-push";
import {
  MANUAL_ONLY_BY_FLOW,
  ORDER_STATUS_OPTIONS,
  orderStatusBadge,
} from "@/lib/format";

type Supa = ReturnType<typeof createAdminClient>;

// بعد أي تعديل بنود: نبلّغ شوبيفاي وبوسطة في الخلفية (بعد ما الرد يوصل المستخدم)
//
// الاتنين **مستقلين عن بعض بقصد**. قبل كده كانوا ورا بعض، فلو شوبيفاي
// اتأخرت (وقتها الأقصى ٢٠ ثانية) كان ممكن الوقت يخلص قبل ما بوسطة تتحدّث
// أصلاً — والنتيجة إن المندوب يحصّل مبلغ قديم ومحدش ياخد باله.
function pushOrderToShopify(orderId: string) {
  after(async () => {
    const db = createAdminClient();

    const toShopify = (async () => {
      try {
        const res = await runShopifyOrderPush({ db, orderId });

        if (!res.ok) {
          // **لازم نبص على الرد.** قبل كده كنا بنبعت وخلاص، فلو شوبيفاي رفضت
          // مكانش حد يعرف — وأوردر أحمد خالد فضل بقطعة واحدة في شوبيفاي بعد
          // ما زوّدناها عندنا، ومحدش خد باله.
          await logActivity(
            null,
            "shopify.push",
            `⚠️ تعديل أوردر ${await orderNo(db, orderId)} مااتبعتش لشوبيفاي: ${res.error}`,
            orderId
          );
          return;
        }

        // الأوردر الملغي بنعدّي عليه من غير كلام — ده وضع طبيعي مش مشكلة
        if (res.skipped) return;

        if (res.changed > 0) {
          await logActivity(
            null,
            "shopify.push",
            `تعديل أوردر ${await orderNo(db, orderId)} اتبعت لشوبيفاي`,
            orderId
          );
        }

        // **ده إصلاح "مفيش فرق" وفيه فرق.** شوبيفاي مابتخليكش ترفع سعر بند،
        // فالفرق ده مستحيل ننفّذه — والقديمة كانت بتسكت عليه وترجّع نجاح.
        // بقى بيتسجّل، لأن معناه إن سعر عندك مش موجود عند شوبيفاي.
        if (res.plan.cantRaise.length > 0) {
          const detail = res.plan.cantRaise
            .map((c) => `${c.system} بدل ${c.base}`)
            .join(" ، ");
          await logActivity(
            null,
            "shopify.push",
            `⚠️ سعر أوردر ${await orderNo(db, orderId)} أعلى من سعر الكتالوج فشوبيفاي مابتقبلوش (${detail}) — ظبّطه من لوحة شوبيفاي`,
            orderId
          );
        }
      } catch (e) {
        // الأوردر المتشحن شوبيفاي بتقفل تعديل كمياته — ده متوقع، بس لازم
        // يتسجّل عشان تعرف إن التعديل عندك مش موجود هناك
        await logActivity(
          null,
          "shopify.push",
          `⚠️ الدفع لشوبيفاي وقع في أوردر ${await orderNo(db, orderId)}: ${
            e instanceof Error ? e.message : "سبب مش معروف"
          }`,
          orderId
        );
      }
    })();

    // بوسطة: تحديث مبلغ التحصيل (طول ما الشحنة لسه ماتاخدتش).
    // بنسجّل النتيجة في سجل النشاط — ده بيلمس فلوس، فمينفعش يفشل في الخفا.
    const toBosta = (async () => {
      try {
        const res = await runBostaUpdateCod({ db, orderId });
        if (!res.ok) {
          await logActivity(
            null,
            "bosta.cod",
            `⚠️ معرفناش نحدّث تحصيل أوردر ${await orderNo(db, orderId)} عند بوسطة: ${res.error}`,
            orderId
          );
        } else if (res.changed) {
          await logActivity(
            null,
            "bosta.cod",
            `تحصيل أوردر ${await orderNo(db, orderId)} عند بوسطة اتغيّر من ${res.was ?? "؟"} لـ ${res.cod}`,
            orderId
          );
        }
      } catch (e) {
        await logActivity(
          null,
          "bosta.cod",
          `⚠️ تحديث تحصيل أوردر ${await orderNo(db, orderId)} وقع: ${
            e instanceof Error ? e.message : "سبب مش معروف"
          }`,
          orderId
        );
      }
    })();

    await Promise.allSettled([toShopify, toBosta]);
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
  await logActivity(me, "order.items", `أضاف منتج لأوردر ${await orderNo(supabase, orderId)}`, orderId);

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
  await logActivity(me, "order.items", `مسح منتج من أوردر ${await orderNo(supabase, orderId)}`, orderId);

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
  await logActivity(me, "order.items", `عدّل كمية بند في أوردر ${await orderNo(supabase, orderId)}`, orderId);

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
  await logActivity(me, "order.discount", `غيّر خصم أوردر ${await orderNo(supabase, orderId)} لـ ${discount}`, orderId);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

// تحديث الحالة من قايمة الأوردرات من غير redirect — عشان الصفحة ماترجعش لفوق
export async function updateOrderStatusInline(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  const status = String(formData.get("status") ?? "");

  const isValidStatus =
    ORDER_STATUS_OPTIONS.some((o) => o.value === status) &&
    !MANUAL_ONLY_BY_FLOW.includes(status);
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
    `غيّر حالة أوردر ${await orderNo(supabase, orderId)} لـ ${orderStatusBadge(status).label}`,
    orderId
  );
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function bulkUpdateStatus(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const orderIds = formData.getAll("order_ids").map(String).filter(Boolean);
  const status = String(formData.get("status") ?? "");

  const isValidStatus =
    ORDER_STATUS_OPTIONS.some((o) => o.value === status) &&
    !MANUAL_ONLY_BY_FLOW.includes(status);
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

  // حماية من الدوس المتكرر: نفس التعليق على نفس الأوردر في نص دقيقة = واحد.
  // ده حصل فعلًا — ٦ نسخ من نفس التعليق في ٨ ثواني، لأن الشاشة كانت بتتقفل
  // من غير ما تبيّن إن التعليق اتسجّل فالمستخدم يدوس تاني وتالت.
  const since = new Date(Date.now() - 30_000).toISOString();
  const { data: recent } = await supabase
    .from("order_comments")
    .select("id")
    .eq("order_id", orderId)
    .eq("body", body)
    .gte("created_at", since)
    .limit(1);

  if (!recent?.length) {
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
  }

  // **من غير redirect بقصد** — الشاشة تفضل مفتوحة والتعليق يظهر في مكانه.
  // الـ redirect القديم كان بيقفل المودال فيبان إن الحفظ فشل.
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
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

  // من غير redirect — الشاشة تفضل مفتوحة زي الإضافة
  revalidatePath("/orders");
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

  await logActivity(me, "order.shipping", `غيّر شحن أوردر ${await orderNo(supabase, orderId)} لـ ${shippingPrice}`, orderId);
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

  // جدول `shipments` متجمّد — آخر مرة اتكتب فيه ١٩ يوليو ٢٠٢٦، والمزامنة
  // الجديدة بتكتب في `orders` بس. الصفوف القديمة سايبينها كتاريخ، والمسح
  // هنا باقي عشان الأوردر المتمسوح مايسيبش وراه صفوف معلّقة.
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
    .select("id, order_number, order_status")
    .eq("bosta_tracking", tracking)
    .neq("id", orderId)
    .maybeSingle();

  const from = other as
    | { id: string; order_number: string | null; order_status: string | null }
    | null;

  if (from) {
    // **الأوردر الملغي بيسيب شحنته** — دي كانت حلقة مقفولة: العميل بيلغي،
    // وإنت عايز تستخدم شحنته لأوردر تاني، والسيستم بيقول «فكّه من الأوردر
    // الأول» ومفيش مكان تفكّه منه. الإلغاء نفسه هو الفك.
    if (from.order_status !== "cancelled") {
      redirect(
        `/orders/${orderId}?error=` +
          encodeURIComponent(
            `رقم التتبع ده مربوط بأوردر ${from.order_number} — الغي الأوردر ده الأول وبعدين اربطه هنا`
          )
      );
    }

    const { error: freeErr } = await supabase
      .from("orders")
      .update({ bosta_tracking: null })
      .eq("id", from.id);
    if (freeErr) {
      redirect(
        `/orders/${orderId}?error=` +
          encodeURIComponent("معرفناش نفك الشحنة من الأوردر الملغي")
      );
    }

    await logActivity(
      me,
      "bosta.unlink",
      `فكّ شحنة ${tracking} من أوردر ${from.order_number} الملغي`,
      from.id
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

  await logActivity(me, "bosta.link", `ربط شحنة ${tracking} بأوردر ${await orderNo(supabase, orderId)}`, orderId);
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

  // ده الأكشن اللي جوّه الأوردر — هنا "مرتجع بعد التسليم" **مسموحة**، لأن
  // عمر ساعات بيعمل المرتجع في بوسطة بإيده فمحتاج يظبّط الحالة بنفسه.
  // اللي ممنوع هو تحطها من قايمة الأوردرات برّه (الأكشنين اللي فوق).
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
    `غيّر حالة أوردر ${o?.order_number ?? ""} لـ ${orderStatusBadge(status).label}`.trim(),
    orderId
  );

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(returnTo + joiner + "saved=1");
}

// إرسال الأوردر لبوسطة كشحنة — الكود جوّه المشروع في lib/bosta/create.ts،
// وبيستخدم مفتاح بوسطة بتاع البيزنس صاحب الأوردر
export async function sendOrderToBosta(formData: FormData) {
  const me = await requirePermission("ship.send");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/orders");

  let ok = false;
  let message = "معرفناش نبعت الشحنة لبوسطة";
  try {
    const res = await runBostaCreate({ db: createAdminClient(), orderId });
    if (res.ok) ok = true;
    else message = res.error;
  } catch (e) {
    message =
      e instanceof Error ? e.message : "الاتصال ببوسطة فشل — جرّب تاني";
  }

  if (ok) {
    await logActivity(me, "bosta.send", `بعت أوردر لبوسطة كشحنة`, orderId);
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
  if (!me || !can(me, "ship.send")) {
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

  const db = createAdminClient();
  // المدن مرة واحدة للدفعة كلها بدل مرة لكل أوردر
  const cities = await loadBostaCities(db, me.tenantId);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const failMsgs: string[] = [];

  async function sendOne(id: string) {
    try {
      const res = await runBostaCreate({ db, orderId: id, cities });
      if (!res.ok) {
        failed++;
        failMsgs.push(res.error);
      } else if ("already" in res) {
        skipped++;
      } else {
        sent++;
      }
    } catch (e) {
      failed++;
      if (e instanceof Error) failMsgs.push(e.message);
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

// عمل شحنة مرتجع (عكسية) من عند العميل ليك — بننادي دالة bosta-return
export async function createReturnShipment(formData: FormData) {
  const me = await requirePermission("ship.send");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/orders");

  let ok = false;
  let message = "معرفناش نعمل شحنة المرتجع";
  const supabase = createAdminClient();
  try {
    const res = await runBostaReturn({ db: supabase, orderId });
    if (res.ok) ok = true;
    else message = res.error;
  } catch (e) {
    message =
      e instanceof Error ? e.message : "الاتصال ببوسطة فشل — جرّب تاني";
  }

  if (ok) {
    // الشحنة العكسية اتعملت — الأوردر بقى "في الطريق ليك".
    // **مش "مرتجع بعد التسليم" من دلوقتي** — دي بتتحط لما البضاعة توصلك
    // فعلًا، والمزامنة هي اللي بتحطها لما شحنة المرتجع تخلص.
    await supabase
      .from("orders")
      .update({ order_status: "returning" })
      .eq("id", orderId);

    await logActivity(
      me,
      "bosta.return",
      `عمل شحنة مرتجع لأوردر ${await orderNo(supabase, orderId)} — بوسطة هتسحبها من العميل`,
      orderId
    );
  }
  revalidatePath(`/orders/${orderId}`);
  redirect(
    ok
      ? `/orders/${orderId}?saved=` +
          encodeURIComponent("اتعملت شحنة المرتجع — بوسطة هتسحبها من العميل")
      : `/orders/${orderId}?error=` + encodeURIComponent(message)
  );
}

// حفظ المرتجع: بنختار المنتجات اللي رجعت وكمياتها من بنود الأوردر نفسه
// وبنرجّع مخزونها تلقائياً (الفرق بين الكمية الراجعة القديمة والجديدة)
export async function saveReturnedItems(formData: FormData) {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("order_id") ?? "");
  const tracking = String(formData.get("return_tracking") ?? "").trim();
  if (!orderId) redirect("/orders");

  const supabase = createAdminClient();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, quantity, returned_quantity, variant_id")
    .eq("order_id", orderId)
    .overrideTypes<
      {
        id: string;
        quantity: number;
        returned_quantity: number | null;
        variant_id: string | null;
      }[]
    >();

  let totalReturned = 0;
  for (const item of items ?? []) {
    const raw = formData.get(`ret_${item.id}`);
    let qty = raw != null && String(raw).trim() !== "" ? Number(raw) : 0;
    if (!Number.isInteger(qty) || qty < 0) qty = 0;
    if (qty > item.quantity) qty = item.quantity;

    const was = Number(item.returned_quantity ?? 0);
    if (qty === was) {
      totalReturned += qty;
      continue;
    }

    await supabase
      .from("order_items")
      .update({ returned_quantity: qty })
      .eq("id", item.id);

    // الفرق يرجع للمخزون (أو يتخصم لو قلّلنا الكمية الراجعة)
    await adjustStock(
      supabase,
      item.variant_id,
      qty - was,
      orderId,
      "مرتجع بعد التسليم"
    );
    totalReturned += qty;
  }

  const { error } = await supabase
    .from("orders")
    .update({ return_note: tracking || null })
    .eq("id", orderId);

  if (error) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نحفظ المرتجع: " + error.message)
    );
  }

  await logActivity(
    me,
    "order.return",
    `سجّل مرتجع ${totalReturned} قطعة لأوردر ${await orderNo(supabase, orderId)}`,
    orderId
  );
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/products");
  redirect(`/orders/${orderId}?saved=1`);
}

// حفظ تفاصيل المرتجع (إيه اللي رجع + رقم شحنة المرتجع)
export async function saveReturnNote(formData: FormData) {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("order_id") ?? "");
  const note = String(formData.get("return_note") ?? "").trim();
  if (!orderId) redirect("/orders");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ return_note: note || null })
    .eq("id", orderId);

  if (error) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نحفظ تفاصيل المرتجع: " + error.message)
    );
  }

  await logActivity(
    me,
    "order.return_note",
    `سجّل تفاصيل مرتجع لأوردر ${await orderNo(supabase, orderId)}`,
    orderId
  );
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?saved=1`);
}

// طريقة الدفع والمدفوع مقدماً (إنستا باي / فيزا / ديبوزيت)
// مبلغ التحصيل من بوسطة = إجمالي الأوردر ناقص المدفوع مقدماً
export async function updatePayment(formData: FormData) {
  const me = await requirePermission("orders.items");
  const orderId = String(formData.get("order_id") ?? "");
  const method = String(formData.get("payment_method") ?? "cod");
  const paidRaw = formData.get("amount_paid");
  const amountPaid =
    paidRaw != null && String(paidRaw).trim() !== "" ? Number(paidRaw) : 0;

  if (!orderId) redirect("/orders");
  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("المبلغ المدفوع لازم رقم موجب")
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ payment_method: method, amount_paid: amountPaid })
    .eq("id", orderId);

  if (error) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نحفظ طريقة الدفع: " + error.message)
    );
  }

  // لو الدفع اتغيّر، مبلغ التحصيل في بوسطة لازم يتحدّث
  await pushOrderToShopify(orderId);
  await logActivity(
    me,
    "order.payment",
    `غيّر طريقة الدفع لأوردر ${await orderNo(supabase, orderId)} (مدفوع ${amountPaid})`,
    orderId
  );
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

/**
 * تأكيد إنك حوّلت فلوس المرتجع للعميل.
 * بوسطة مابتدفعش للعميل — إنت اللي بتحوّله. والتأكيد ده هو اللي بيوقف
 * التنبيهات وبيخلي فيه أثر إن الفلوس رجعت فعلاً.
 */
export async function confirmRefund(formData: FormData) {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("order_id") ?? "");
  const rawAmount = String(formData.get("amount") ?? "").trim();
  if (!orderId) redirect("/orders");

  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    redirect(
      `/orders/${orderId}?error=` + encodeURIComponent("المبلغ مش صحيح")
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      refunded_at: new Date().toISOString(),
      refunded_amount: amount,
    })
    .eq("id", orderId);

  if (error) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent(
          "معرفناش نحفظ: " + error.message + " — شغّل sql/refunds.sql"
        )
    );
  }

  await logActivity(
    me,
    "order.refund",
    `أكّد تحويل ${amount} جنيه للعميل في أوردر ${await orderNo(supabase, orderId)}`,
    orderId
  );
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=` + encodeURIComponent("اتسجّل إنك حوّلت الفلوس"));
}

/** بيلغي التأكيد لو اتحط بالغلط */
export async function undoRefund(formData: FormData) {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/orders");

  const supabase = createAdminClient();
  await supabase
    .from("orders")
    .update({ refunded_at: null, refunded_amount: null, refund_reminded_day: null })
    .eq("id", orderId);

  await logActivity(
    me,
    "order.refund_undo",
    `لغى تأكيد تحويل فلوس المرتجع في أوردر ${await orderNo(supabase, orderId)}`,
    orderId
  );
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?saved=` + encodeURIComponent("اتلغى التأكيد"));
}

/**
 * تأكيد إن بوسطة حوّلت فلوس الأوردر فعلًا.
 *
 * بوسطة بتحصّل من العميل وبتقعد بالفلوس يوم أو أكتر، وبتحوّل بدفعات. ومسار
 * محفظتهم مقفول علينا (بيرجّع ٤٠١)، فمفيش طريقة نعرف التحويل تلقائيًا —
 * التأكيد يدوي بقصد.
 */
export async function confirmCashReceived(formData: FormData) {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/orders");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ cash_received_at: new Date().toISOString() })
    .eq("id", orderId);

  if (error) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent(
          "معرفناش نحفظ: " + error.message + " — شغّل sql/cash-received.sql"
        )
    );
  }

  await logActivity(
    me,
    "cash.received",
    `أكّد إن بوسطة حوّلت فلوس أوردر ${await orderNo(supabase, orderId)}`,
    orderId
  );
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=` + encodeURIComponent("اتسجّل إن الفلوس وصلت"));
}

/** بيلغي التأكيد لو اتحط بالغلط */
export async function undoCashReceived(formData: FormData) {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/orders");

  const supabase = createAdminClient();
  await supabase
    .from("orders")
    .update({ cash_received_at: null })
    .eq("id", orderId);

  await logActivity(
    me,
    "cash.received_undo",
    `لغى تأكيد وصول فلوس أوردر ${await orderNo(supabase, orderId)}`,
    orderId
  );
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?saved=` + encodeURIComponent("اتلغى التأكيد"));
}

/**
 * تأكيد دفعة كاملة مرة واحدة.
 * بوسطة بتحوّل أسبوعيًا بدفعة فيها أوردرات كتير — فتعليم كل واحد لوحده
 * مش عملي.
 */
export async function bulkConfirmCashReceived(
  formData: FormData
): Promise<{ ok: boolean; done: number; error?: string }> {
  const me = await getSessionUser();
  if (!me || !can(me, "orders.status")) {
    return { ok: false, done: 0, error: "مالكش صلاحية" };
  }

  const ids = formData
    .getAll("order_ids")
    .map(String)
    .filter(Boolean)
    .slice(0, 200);
  if (ids.length === 0) return { ok: false, done: 0, error: "محددتش أي أوردر" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ cash_received_at: new Date().toISOString() })
    .in("id", ids)
    .is("cash_received_at", null);

  if (error) return { ok: false, done: 0, error: error.message };

  await logActivity(
    me,
    "cash.received",
    `أكّد وصول فلوس ${ids.length} أوردر`
  );
  revalidatePath("/orders");
  return { ok: true, done: ids.length };
}

// شحنة التبديل: بوسطة توصّل الجديد وتاخد القديم في نفس الرحلة
export async function createExchangeShipment(formData: FormData) {
  const me = await requirePermission("ship.send");
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/orders");

  const supabase = createAdminClient();

  // بنقرا الكميات من الفورم ونحوّلها لبنود بأسماء المنتجات
  const { data: rows } = await supabase
    .from("order_items")
    .select("id, product_variants(products(name, name_ar))")
    .eq("order_id", orderId);

  const named = (
    (rows ?? []) as unknown as {
      id: string;
      product_variants: {
        products: { name: string | null; name_ar: string | null } | null;
      } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    name:
      r.product_variants?.products?.name_ar ||
      r.product_variants?.products?.name ||
      null,
  }));

  const lines = (prefix: string) =>
    named
      .map((r) => ({
        quantity: Number(formData.get(`${prefix}_${r.id}`) ?? 0),
        productName: r.name,
      }))
      .filter((l) => l.quantity > 0);

  const outgoing = lines("out");
  const incoming = lines("back");
  const cod = Number(formData.get("exchange_cod") ?? 0);

  let ok = false;
  let message = "معرفناش نعمل شحنة التبديل";
  try {
    const res = await runBostaExchange({
      db: supabase,
      orderId,
      outgoing,
      incoming,
      cod: Number.isFinite(cod) ? cod : 0,
    });
    if (res.ok) ok = true;
    else message = res.error;
  } catch (e) {
    message = e instanceof Error ? e.message : "الاتصال ببوسطة فشل — جرّب تاني";
  }

  if (ok) {
    await logActivity(
      me,
      "bosta.exchange",
      `عمل شحنة تبديل لأوردر ${await orderNo(supabase, orderId)} — بوسطة هتوصّل الجديد وتاخد القديم`,
      orderId
    );
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(
    ok
      ? `/orders/${orderId}?saved=` +
          encodeURIComponent("اتعملت شحنة التبديل — بوسطة هتوصّل الجديد وتاخد القديم")
      : `/orders/${orderId}?error=` + encodeURIComponent(message)
  );
}

/**
 * سبب رجوع الشحنة.
 *
 * ⚠️ **بيتفلتر بالبيزنس كمان مش بالـ`id` بس.** المفتاح ده بيعدّي على
 * الـRLS، فالتعديل بـ`id` لوحده معناه إن حد من بيزنس يقدر يبعت رقم أوردر
 * من بيزنس تاني ويعدّله. أكشنات قديمة كتير في الملف ده لسه بتعمل كده —
 * متسجّل في `docs/NEXT.md`.
 */
export async function updateReturnReason(formData: FormData) {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("return_reason") ?? "").trim();

  if (!orderId) redirect("/orders");

  // القايمة مقفولة — أي حاجة برّاها بتترفض بدل ما تتخزّن وتلوّث الإحصائية
  if (reason && !isReturnReason(reason)) {
    redirect(
      `/orders/${orderId}?error=` + encodeURIComponent("السبب ده مش في القايمة")
    );
  }

  const supabase = createAdminClient();
  const { error, count } = await supabase
    .from("orders")
    .update({ return_reason: reason || null }, { count: "exact" })
    .eq("id", orderId)
    .eq("tenant_id", me.tenantId);

  if (error || count === 0) {
    redirect(
      `/orders/${orderId}?error=` +
        encodeURIComponent("معرفناش نحفظ سبب الرجوع")
    );
  }

  await logActivity(
    me,
    "order.return_reason",
    `سجّل سبب رجوع أوردر ${await orderNo(supabase, orderId)}: ${returnReasonLabel(reason)}`,
    orderId
  );
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?saved=1`);
}
