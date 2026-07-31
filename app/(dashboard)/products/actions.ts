"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { COST_COMPONENTS } from "@/lib/format";
import { runProductImport, type ImportResult } from "@/lib/shopify/products";
import { parseCostFile, type CostFilePlan } from "@/lib/costs-file";
import { recordImportRun } from "@/lib/import-runs";

export async function deleteProduct(formData: FormData) {
  const me = await requirePermission("products.edit");
  const productId = String(formData.get("product_id") ?? "");
  if (!productId) {
    redirect("/products");
  }

  const supabase = createAdminClient();

  // نجيب أشكال المنتج
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  const variantIds = (variants ?? []).map((v) => v.id);

  // مينفعش نمسح منتج عليه أوردرات — التاريخ لازم يفضل سليم
  if (variantIds.length > 0) {
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("variant_id", variantIds);
    if ((count ?? 0) > 0) {
      redirect(
        `/products/${productId}?error=` +
          encodeURIComponent(
            "المنتج ده عليه أوردرات مسجلة فمينفعش يتمسح — التاريخ لازم يفضل موجود"
          )
      );
    }
  }

  // نمسح حركات المخزون ثم الأشكال ثم المنتج
  if (variantIds.length > 0) {
    await supabase.from("stock_movements").delete().in("variant_id", variantIds);
    await supabase
      .from("variant_cost_components")
      .delete()
      .in("variant_id", variantIds);
    await supabase.from("product_variants").delete().eq("product_id", productId);
  }

  const { data: prod } = await supabase
    .from("products")
    .select("name_ar, name")
    .eq("id", productId)
    .maybeSingle();

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);

  if (error) {
    redirect(
      `/products/${productId}?error=` +
        encodeURIComponent("معرفناش نمسح المنتج: " + error.message)
    );
  }

  await logActivity(me, "product.delete", `مسح منتج ${prod?.name_ar || prod?.name || ""}`.trim());
  revalidatePath("/products");
  redirect("/products?deleted=1");
}

export async function saveStock(formData: FormData) {
  const me = await requirePermission("products.stock");
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

  const supabase = createAdminClient();

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

  await logActivity(me, "product.stock", `عدّل مخزون منتج لـ ${quantity}`);
  revalidatePath("/products");
  revalidatePath(returnTo);
  redirect(returnTo + "?saved=1");
}

export async function saveSalePrice(formData: FormData) {
  const me = await requirePermission("products.edit");
  const variantId = String(formData.get("variant_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const salePrice = Number(formData.get("sale_price"));
  const returnTo = `/products/${productId}`;

  if (!variantId || !Number.isFinite(salePrice) || salePrice < 0) {
    redirect(returnTo + "?error=" + encodeURIComponent("السعر لازم رقم موجب"));
  }

  const supabase = createAdminClient();

  const { error, count } = await supabase
    .from("product_variants")
    .update({ sale_price: salePrice }, { count: "exact" })
    .eq("id", variantId);

  if (error || count === 0) {
    redirect(
      returnTo +
        "?error=" +
        encodeURIComponent("معرفناش نحفظ السعر — اتأكد إن عندك صلاحية تعديل")
    );
  }

  await logActivity(me, "product.price", `غيّر سعر بيع منتج لـ ${salePrice}`);
  revalidatePath("/products");
  revalidatePath(returnTo);
  redirect(returnTo + "?saved=1");
}

export async function saveProductName(formData: FormData) {
  await requirePermission("products.edit");
  const productId = String(formData.get("product_id") ?? "");
  const nameAr = String(formData.get("name_ar") ?? "").trim();
  const returnTo = `/products/${productId}`;

  if (!productId) {
    redirect("/products?error=" + encodeURIComponent("المنتج ده مش موجود"));
  }

  const supabase = createAdminClient();

  const { error, count } = await supabase
    .from("products")
    .update({ name_ar: nameAr || null }, { count: "exact" })
    .eq("id", productId);

  if (error || count === 0) {
    redirect(
      returnTo +
        "?error=" +
        encodeURIComponent("معرفناش نحفظ الاسم — اتأكد إن عندك صلاحية تعديل")
    );
  }

  revalidatePath("/products");
  revalidatePath(returnTo);
  redirect(returnTo + "?saved=1");
}

export async function saveSku(formData: FormData) {
  await requirePermission("products.edit");
  const variantId = String(formData.get("variant_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const sku = String(formData.get("sku") ?? "").trim();
  const returnTo = `/products/${productId}`;

  if (!variantId || !productId) {
    redirect("/products?error=" + encodeURIComponent("المنتج ده مش موجود"));
  }

  const supabase = createAdminClient();

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
  const me = await requirePermission("products.cost");
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

  const supabase = createAdminClient();

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

  await logActivity(me, "product.cost", `عدّل تكلفة منتج لـ ${total}`);
  revalidatePath("/products");
  revalidatePath(returnTo);
  redirect(returnTo + "?saved=1");
}

/**
 * جلب المنتجات من شوبيفاي (بند ٤.٣).
 *
 * **`dry` بيعرض بس مابيكتبش** — القاعدة في المشروع إن أي عملية بتلمس داتا
 * بتتعرض قبل ما تتنفّذ.
 *
 * وبيرجّع معاها **الناقص**: الأشكال اللي تكلفتها صفر. من غير ده العميل
 * الجديد هيفتكر إنه خلّص وهو لسه مابدأش — شوبيفاي مافيهاش تكلفة أصلًا.
 */
export async function importShopifyProducts(
  dry: boolean
): Promise<ImportResult> {
  const me = await requirePermission("products.edit");
  const res = await runProductImport({
    db: createAdminClient(),
    tenantId: me.tenantId,
    dry,
  });

  if (res.ok && !res.dry && res.added && res.added.products + res.added.variants > 0) {
    await logActivity(
      me,
      "products.import",
      `جلب من شوبيفاي: ${res.added.products} منتج و${res.added.variants} شكل`
    );
    await recordImportRun(createAdminClient(), {
      kind: "products",
      summary: `${res.added.products} منتج و${res.added.variants} شكل`,
      actorName: me.fullName ?? me.email ?? null,
      payload: res.undo ?? {},
    });
    revalidatePath("/products");
  }

  return res;
}

export type CostUploadResult =
  | { ok: true; dry: boolean; plan: CostFilePlan; applied?: number }
  | { ok: false; error: string };

/**
 * رفع ملف التكاليف (بند ٤.٦).
 *
 * **بيعرض الأول وبعدين ينفّذ.** والخانة الفاضية معناها "سيبها زي ما هي" مش
 * "صفّرها" — أغلب الناس بتملا الناقص وتسيب الباقي.
 */
export async function uploadCostFile(
  formData: FormData
): Promise<CostUploadResult> {
  const me = await requirePermission("products.edit");
  const dry = String(formData.get("dry") ?? "1") === "1";
  const text = String(formData.get("content") ?? "");

  if (!text.trim()) return { ok: false, error: "الملف فاضي" };

  const db = createAdminClient();
  const { data, error } = await db
    .from("product_variants")
    .select("id, variant_name, cost_price, products(name, name_ar)")
    .overrideTypes<
      {
        id: string;
        variant_name: string | null;
        cost_price: number;
        products: { name: string | null; name_ar: string | null } | null;
      }[]
    >();

  if (error) return { ok: false, error: "معرفناش نقرا المنتجات: " + error.message };

  const known = new Map(
    (data ?? []).map((v) => {
      const base = v.products?.name_ar || v.products?.name || "بدون اسم";
      const variant = String(v.variant_name ?? "").trim();
      const name =
        variant && variant.toLowerCase() !== "default title"
          ? `${base} — ${variant}`
          : base;
      return [v.id, { name, costPrice: Number(v.cost_price ?? 0) }];
    })
  );

  const plan = parseCostFile(text, known);
  if (dry || plan.updates.length === 0) return { ok: true, dry, plan };

  let applied = 0;
  for (const u of plan.updates) {
    const { error: upErr } = await db
      .from("product_variants")
      .update({ cost_price: u.to })
      .eq("id", u.variantId);
    if (!upErr) applied++;
  }

  if (applied > 0) {
    await logActivity(me, "products.costs", `حدّث تكلفة ${applied} شكل من ملف`);
    // التراجع هنا مش مسح — ده رجوع كل تكلفة لقيمتها اللي كانت قبل الملف
    await recordImportRun(db, {
      kind: "costs",
      summary: `تكلفة ${applied} شكل`,
      actorName: me.fullName ?? me.email ?? null,
      payload: {
        costs: plan.updates.map((u) => ({
          variantId: u.variantId,
          previous: u.from,
        })),
      },
    });
    revalidatePath("/products");
  }

  return { ok: true, dry: false, plan, applied };
}
