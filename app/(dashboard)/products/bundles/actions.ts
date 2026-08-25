"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { checkBundle, type BundleItem } from "@/lib/bundle";

function back(msg: string, ok = false): never {
  redirect(
    `/products/bundles?${ok ? "saved" : "error"}=` + encodeURIComponent(msg)
  );
}

/**
 * بيعمل باقة.
 *
 * ⚠️⚠️ **البنود بتتقرا من الداتابيز مش من الفورم.** لو أخدنا السعر والتكلفة
 * من الصفحة، أي حد يقدر يبعت سعر بند بجنيه ويعدّي الفحص («الباقة أرخص من
 * بنودها») وهي خسارة. الفورم بيبعت **الأشكال والكميات بس**.
 */
export async function createBundle(formData: FormData) {
  const me = await requirePermission("products.edit");
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price"));
  const note = String(formData.get("note") ?? "").trim() || null;

  // شكل + كمية لكل سطر
  const variantIds = formData.getAll("variant_id").map(String);
  const quantities = formData.getAll("quantity").map(Number);

  const picked = variantIds
    .map((id, i) => ({ id: id.trim(), qty: Math.floor(quantities[i] ?? 0) }))
    .filter((x) => x.id && x.qty > 0);

  if (picked.length === 0) back("اختار منتجين على الأقل");

  // ⚠️ نفس الشكل مرتين = الكمية بتتجمع، مش صفين
  const merged = new Map<string, number>();
  for (const p of picked) merged.set(p.id, (merged.get(p.id) ?? 0) + p.qty);

  const db = createAdminClient();

  const { data: variants, error: readError } = await db
    .from("product_variants")
    .select("id, variant_name, sale_price, cost_price, products(name, name_ar)")
    // ⚠️ **tenant_id إجباري مع مفتاح الأدمن** — بيعدّي فوق قواعد المنع
    .eq("tenant_id", me.tenantId)
    .in("id", [...merged.keys()]);

  if (readError) back("معرفناش نقرا المنتجات: " + readError.message);

  type V = {
    id: string;
    variant_name: string | null;
    sale_price: number | null;
    cost_price: number | null;
    products: { name: string | null; name_ar: string | null } | null;
  };

  const rows = (variants ?? []) as unknown as V[];
  if (rows.length !== merged.size) {
    back("فيه منتج مش موجود — حدّث الصفحة وجرّب تاني");
  }

  const items: BundleItem[] = rows.map((v) => ({
    variantId: v.id,
    name:
      [v.products?.name_ar ?? v.products?.name, v.variant_name]
        .filter(Boolean)
        .join(" · ") || null,
    quantity: merged.get(v.id) ?? 1,
    unitPrice: Number(v.sale_price ?? 0),
    unitCost: Number(v.cost_price ?? 0),
  }));

  const check = checkBundle({ name, price, items });
  if (!check.ok) back(check.reason);

  const { data: bundle, error } = await db
    .from("bundles")
    .insert({ tenant_id: me.tenantId, name, price, note })
    .select("id")
    .single();

  if (error || !bundle) {
    back(
      "معرفناش نحفظ الباقة: " +
        (error?.message ?? "") +
        " — لو الجداول لسه مااتعملتش شغّل sql/bundles.sql"
    );
  }

  const { error: itemsError } = await db.from("bundle_items").insert(
    items.map((i) => ({
      tenant_id: me.tenantId,
      bundle_id: bundle.id,
      variant_id: i.variantId,
      quantity: i.quantity,
    }))
  );

  if (itemsError) {
    // ⚠️ الباقة من غير بنود مالهاش معنى — بنشيلها بدل ما تفضل نص حاجة
    await db
      .from("bundles")
      .delete()
      .eq("tenant_id", me.tenantId)
      .eq("id", bundle.id);
    back("معرفناش نحفظ بنود الباقة: " + itemsError.message);
  }

  await logActivity(me, "bundle.add", `عمل باقة ${name} بسعر ${price}`);
  revalidatePath("/products/bundles");
  back("تمام — الباقة اتعملت", true);
}

/**
 * بيقفل الباقة أو بيفتحها.
 *
 * ⚠️ **بيتقفل مش بيتمسح** — الأوردرات القديمة بتشاور عليها، ومسحها بيخلّي
 * تاريخ البيع يشاور على حاجة مش موجودة.
 */
export async function toggleBundle(formData: FormData) {
  const me = await requirePermission("products.edit");
  const id = String(formData.get("bundle_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "1";
  if (!id) back("مافيش باقة");

  const { error } = await createAdminClient()
    .from("bundles")
    .update({ active })
    .eq("tenant_id", me.tenantId)
    .eq("id", id);

  if (error) back("معرفناش نحفظ: " + error.message);

  await logActivity(me, "bundle.toggle", active ? "فتح باقة" : "قفل باقة");
  revalidatePath("/products/bundles");
  back(active ? "الباقة اشتغلت" : "الباقة اتقفلت", true);
}
