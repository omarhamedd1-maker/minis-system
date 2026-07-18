"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COST_COMPONENTS } from "@/lib/format";

export async function saveStock(formData: FormData) {
  const variantId = String(formData.get("variant_id") ?? "");
  const quantity = Number(formData.get("quantity"));
  const returnTo = String(formData.get("return_to") ?? "/products");

  if (
    !variantId ||
    !Number.isFinite(quantity) ||
    !Number.isInteger(quantity) ||
    quantity < 0
  ) {
    redirect(
      returnTo +
        "?error=" +
        encodeURIComponent("الكمية لازم تكون رقم صحيح موجب")
    );
  }

  const supabase = await createClient();

  const { data: variant, error: fetchError } = await supabase
    .from("product_variants")
    .select("quantity_on_hand")
    .eq("id", variantId)
    .maybeSingle();

  if (fetchError || !variant) {
    redirect(returnTo + "?error=" + encodeURIComponent("المنتج ده مش موجود"));
  }

  const { error: updateError, count } = await supabase
    .from("product_variants")
    .update({ quantity_on_hand: quantity }, { count: "exact" })
    .eq("id", variantId);

  if (updateError || count === 0) {
    redirect(
      returnTo +
        "?error=" +
        encodeURIComponent("معرفناش نحفظ المخزون — اتأكد إن عندك صلاحية تعديل")
    );
  }

  const quantityDelta = quantity - variant.quantity_on_hand;
  if (quantityDelta !== 0) {
    const { error: movementError } = await supabase
      .from("stock_movements")
      .insert({
        variant_id: variantId,
        change_quantity: quantityDelta,
        reason: "تعديل يدوي",
      });

    if (movementError) {
      redirect(
        returnTo +
          "?error=" +
          encodeURIComponent(
            "الكمية اتحفظت لكن معرفناش نسجلها في سجل حركة المخزون: " +
              movementError.message
          )
      );
    }
  }

  revalidatePath("/products");
  revalidatePath(returnTo);
  redirect(returnTo + "?saved=1");
}

export async function saveSku(formData: FormData) {
  const variantId = String(formData.get("variant_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const sku = String(formData.get("sku") ?? "").trim();
  const returnTo = `/products/${productId}`;

  if (!variantId || !productId) {
    redirect("/products?error=" + encodeURIComponent("المنتج ده مش موجود"));
  }

  const supabase = await createClient();

  const { error, count } = await supabase
    .from("product_variants")
    .update({ sku: sku || null }, { count: "exact" })
    .eq("id", variantId);

  if (error || count === 0) {
    redirect(
      returnTo +
        "?error=" +
        encodeURIComponent("معرفناش نحفظ الكود — اتأكد إن عندك صلاحية تعديل")
    );
  }

  revalidatePath("/products");
  revalidatePath(returnTo);
  redirect(returnTo + "?saved=1");
}

export async function saveCostComponents(formData: FormData) {
  const variantId = String(formData.get("variant_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const returnTo = `/products/${productId}`;

  if (!variantId || !productId) {
    redirect("/products?error=" + encodeURIComponent("المنتج ده مش موجود"));
  }

  const amounts: { component: string; amount: number }[] = [];
  for (const component of COST_COMPONENTS) {
    const raw = String(formData.get(`comp_${component}`) ?? "0").trim();
    const amount = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      redirect(
        returnTo +
          "?error=" +
          encodeURIComponent(`قيمة "${component}" مش صحيحة — لازم رقم موجب`)
      );
    }
    amounts.push({ component, amount });
  }

  const total = amounts.reduce((sum, item) => sum + item.amount, 0);

  const supabase = await createClient();

  const { error: upsertError } = await supabase
    .from("variant_cost_components")
    .upsert(
      amounts.map((item) => ({
        variant_id: variantId,
        component: item.component,
        amount: item.amount,
      })),
      { onConflict: "variant_id,component" }
    );

  if (upsertError) {
    redirect(
      returnTo +
        "?error=" +
        encodeURIComponent(
          "معرفناش نحفظ المكونات — اتأكد إن عندك صلاحية تعديل"
        )
    );
  }

  const { error: costError } = await supabase
    .from("product_variants")
    .update({ cost_price: total })
    .eq("id", variantId);

  if (costError) {
    redirect(
      returnTo +
        "?error=" +
        encodeURIComponent("المكونات اتحفظت لكن معرفناش نحدث التكلفة الإجمالية")
    );
  }

  // تكملة التكلفة الناقصة: بنود الأوردرات القديمة اللي اتسجلت بتكلفة صفر
  if (total > 0) {
    const { error: backfillError } = await supabase
      .from("order_items")
      .update({ cost_price_at_order: total })
      .eq("variant_id", variantId)
      .eq("cost_price_at_order", 0);

    if (backfillError) {
      redirect(
        returnTo +
          "?error=" +
          encodeURIComponent(
            "التكلفة اتحفظت لكن معرفناش نحدث الأوردرات القديمة: " +
              backfillError.message
          )
      );
    }
  }

  revalidatePath("/products");
  revalidatePath(returnTo);
  redirect(returnTo + "?saved=1");
}
