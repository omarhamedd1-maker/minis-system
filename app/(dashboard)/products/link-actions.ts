"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

/**
 * لينك طلب مباشر لشكل واحد.
 *
 * ⚠️ **لينك واحد لكل شكل** — لو موجود بنرجّعه بدل ما نعمل جديد. اللينكات
 * بتتبعت في رسايل وبتفضل موجودة، والتاني بيقسّم العدّاد على اتنين.
 */
export type LinkResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: string };

export async function makeOrderLink(variantId: string): Promise<LinkResult> {
  const me = await requirePermission("products.edit");
  const id = String(variantId ?? "").trim();
  if (!id) return { ok: false, error: "الشكل ده مش موجود" };

  const db = createAdminClient();

  const { data: existing, error: readError } = await db
    .from("order_links")
    .select("id")
    .eq("tenant_id", me.tenantId)
    .eq("variant_id", id)
    .eq("active", true)
    .maybeSingle();

  // ⚠️ الجدول لسه مااتعملش؟ الرسالة بتقول كده بدل «حصل خطأ»
  if (readError) {
    return { ok: false, error: "جدول اللينكات لسه مااتعملش — شغّل sql/order-links.sql" };
  }

  const found = (existing as { id: string } | null)?.id;
  if (found) return { ok: true, id: found, created: false };

  const { data: created, error } = await db
    .from("order_links")
    .insert({ tenant_id: me.tenantId, variant_id: id })
    .select("id")
    .single();

  if (error || !created) {
    return { ok: false, error: "معرفناش نعمل اللينك" };
  }

  await logActivity(me, "product.link", "عمل لينك طلب مباشر");
  revalidatePath("/products");
  return { ok: true, id: created.id, created: true };
}
