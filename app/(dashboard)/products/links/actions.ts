"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

/**
 * لينك طلب فيه أكتر من منتج.
 *
 * ⚠️ **اللينك سلة مش منتج** — لينك لكل منتج معناه إنك تبعت ٥ لينكات في
 * رسالة، والعميل يطلب واحد بس.
 */
export async function createOrderLink(formData: FormData) {
  const me = await requirePermission("products.edit");

  const title = String(formData.get("title") ?? "").trim();
  const ids = formData
    .getAll("variant")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (ids.length === 0) {
    redirect("/products/links?error=" + encodeURIComponent("اختار منتج واحد على الأقل"));
  }

  const db = createAdminClient();

  const { data: link, error } = await db
    .from("order_links")
    .insert({ tenant_id: me.tenantId, title: title || null })
    .select("id")
    .single();

  if (error || !link) {
    redirect(
      "/products/links?error=" +
        encodeURIComponent("معرفناش نعمل اللينك: " + (error?.message ?? ""))
    );
  }

  for (const variantId of ids) {
    await db
      .from("order_link_items")
      .insert({ tenant_id: me.tenantId, link_id: link.id, variant_id: variantId });
  }

  await logActivity(me, "product.link", `عمل لينك طلب فيه ${ids.length} منتج`);
  revalidatePath("/products/links");
  redirect("/products/links?new=" + link.id);
}

/** قفل أو فتح لينك — ⚠️ **مافيش مسح**: اللينكات اتبعتت في رسايل وبتفضل تتفتح */
export async function toggleOrderLink(formData: FormData) {
  const me = await requirePermission("products.edit");
  const id = String(formData.get("link_id") ?? "").trim();
  const active = formData.get("active") === "1";
  if (!id) return;

  const db = createAdminClient();
  await db
    .from("order_links")
    .update({ active })
    .eq("tenant_id", me.tenantId)
    .eq("id", id);

  revalidatePath("/products/links");
}
