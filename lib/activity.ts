import { createAdminClient } from "@/lib/supabase/admin";
import type { SessionUser } from "@/lib/permissions";

// بيسجّل نشاط في جدول activity_log (مين عمل إيه). الفشل مايوقفش الشغل الأساسي.
export async function logActivity(
  actor: SessionUser | null,
  action: string,
  summary: string
) {
  try {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      actor_id: actor?.authUserId ?? null,
      actor_name: actor?.fullName ?? actor?.email ?? "غير معروف",
      action,
      summary,
    });
  } catch {
    // لو الجدول لسه ماتعملش أو حصل خطأ، منوقفش العملية
  }
}
