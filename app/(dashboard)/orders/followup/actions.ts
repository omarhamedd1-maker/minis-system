"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

/**
 * علّم إن العميل اتسأل.
 *
 * ⚠️ **مافيش إرسال هنا** — الرسالة بتروح من واتساب بإيد صاحب المتجر،
 * والزرار ده بيقول «تم» بس عشان الأوردر يخرج من الطابور ومايتكررش.
 */
export async function markFollowedUp(formData: FormData): Promise<void> {
  const me = await requirePermission("orders.status");
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return;

  const db = createAdminClient();
  const { error } = await db
    .from("orders")
    .update({ followed_up_at: new Date().toISOString() })
    // ⚠️ الفلتر ده لازم — من غيره أوردر بيزنس تاني بنفس المعرّف يتعلّم
    .eq("tenant_id", me.tenantId)
    .eq("id", orderId);

  if (!error) {
    await logActivity(me, "order.followup", "سأل العميل بعد التسليم", orderId);
  }

  revalidatePath("/orders/followup");
}
