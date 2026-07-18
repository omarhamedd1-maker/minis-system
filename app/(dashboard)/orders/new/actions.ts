"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_ITEMS = 5;

export async function createOrder(formData: FormData) {
  const customerId = String(formData.get("customer_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const orderNumber = String(formData.get("order_number") ?? "").trim();
  const orderDate = String(formData.get("order_date") ?? "");
  const shippingPriceRaw = Number(formData.get("shipping_price") ?? 0);
  const shippingPrice =
    Number.isFinite(shippingPriceRaw) && shippingPriceRaw > 0
      ? shippingPriceRaw
      : 0;
  // أوردر قديم من قبل السيستم: بنسجله من غير ما نلمس المخزون
  const skipStock = formData.get("skip_stock") === "1";

  const items: { variantId: string; quantity: number }[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const variantId = String(formData.get(`variant_${i}`) ?? "");
    const quantity = Number(formData.get(`qty_${i}`) ?? 0);
    if (!variantId) continue;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      redirect(
        "/orders/new?error=" +
          encodeURIComponent("كل منتج مختار لازم كميته تكون رقم صحيح أكبر من صفر")
      );
    }
    items.push({ variantId, quantity });
  }

  if (items.length === 0) {
    redirect(
      "/orders/new?error=" + encodeURIComponent("اختار منتج واحد على الأقل")
    );
  }
  if (!customerId && !fullName) {
    redirect(
      "/orders/new?error=" +
        encodeURIComponent("اختار عميل موجود أو اكتب اسم عميل جديد")
    );
  }

  const supabase = await createClient();

  // 1) العميل: موجود أو جديد
  let finalCustomerId = customerId || null;
  if (!finalCustomerId) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        shopify_customer_id: `manual-${crypto.randomUUID()}`,
        full_name: fullName,
        phone: phone || null,
        address: address || null,
      })
      .select("id")
      .single();

    if (customerError || !customer) {
      redirect(
        "/orders/new?error=" +
          encodeURIComponent(
            "معرفناش نسجل العميل: " + (customerError?.message ?? "")
          )
      );
    }
    finalCustomerId = customer.id;
  }

  // 2) الأوردر نفسه
  const finalOrderNumber =
    orderNumber || `M-${Date.now().toString().slice(-6)}`;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      shopify_order_id: `manual-${crypto.randomUUID()}`,
      order_number: finalOrderNumber,
      customer_id: finalCustomerId,
      order_status: "new",
      order_date: orderDate || new Date().toISOString().slice(0, 10),
      shipping_price: shippingPrice,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    redirect(
      "/orders/new?error=" +
        encodeURIComponent(
          "معرفناش نسجل الأوردر: " + (orderError?.message ?? "")
        )
    );
  }

  // 3) البنود + خصم المخزون + تسجيل الحركة
  for (const item of items) {
    const { data: variant } = await supabase
      .from("product_variants")
      .select("sale_price, cost_price, quantity_on_hand")
      .eq("id", item.variantId)
      .maybeSingle();

    if (!variant) continue;

    const { error: itemError } = await supabase.from("order_items").insert({
      order_id: order.id,
      variant_id: item.variantId,
      quantity: item.quantity,
      sale_price_at_order: variant.sale_price,
      cost_price_at_order: variant.cost_price,
    });

    if (itemError) {
      redirect(
        `/orders/${order.id}?error=` +
          encodeURIComponent("الأوردر اتسجل لكن في بند فشل: " + itemError.message)
      );
    }

    if (!skipStock) {
      await supabase.from("stock_movements").insert({
        variant_id: item.variantId,
        change_quantity: -item.quantity,
        reason: "أوردر يدوي",
        related_order_id: order.id,
      });

      await supabase
        .from("product_variants")
        .update({ quantity_on_hand: variant.quantity_on_hand - item.quantity })
        .eq("id", item.variantId);
    }
  }

  revalidatePath("/orders");
  revalidatePath("/products");
  redirect(`/orders/${order.id}?saved=1`);
}
