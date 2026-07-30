import { createAdminClient } from "@/lib/supabase/admin";
import type { SessionUser } from "@/lib/permissions";

/**
 * بيسجّل نشاط في جدول activity_log (مين عمل إيه). الفشل مايوقفش الشغل الأساسي.
 *
 * `orderId` مهم: سجل الأوردر بيتجمّع بيه. من غيره بنرجع للتجميع بتشابه النص،
 * واللي بيلقّط حركات مالهاش علاقة (أوردر ١١٣٥٩ بيطلع في سجل ١٣٥٩).
 */
export async function logActivity(
  actor: SessionUser | null,
  action: string,
  summary: string,
  orderId?: string | null
) {
  try {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      actor_id: actor?.authUserId ?? null,
      actor_name: actor?.fullName ?? actor?.email ?? "غير معروف",
      action,
      summary,
      ...(orderId ? { order_id: orderId } : {}),
    });
  } catch {
    // لو الخانة أو الجدول لسه ماتعملوش، منوقفش العملية
  }
}
