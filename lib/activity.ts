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
  orderId?: string | null,
  /**
   * البيزنس — **لازم لما مافيش `actor`**.
   *
   * من غيره السطر بينزل في **بيزنس غلط**: مفتاح الأدمن مالوش مستخدم داخل،
   * فالداتابيز بتحط `current_tenant_id()` واللي بترجّع **مينيز**.
   */
  tenantId?: string
) {
  // ⚠️ **مانعرفش البيزنس؟ مانسجّلش.** السطر اللي بينزل في بيزنس غلط أوحش
  // من السطر اللي مانزلش — ده بيخلّي سجل حد تاني فيه حركة مش بتاعته.
  const tenant = actor?.tenantId ?? tenantId;
  if (!tenant) return;

  try {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      tenant_id: tenant,
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
