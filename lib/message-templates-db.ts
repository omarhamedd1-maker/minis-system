// ==========================================================================
// قراية قوالب الرسايل من الداتابيز
// --------------------------------------------------------------------------
// معزولة عن `lib/message-kinds.ts` عشان الملف ده يفضل صافي وينفع يتجرّب
// من غير قاعدة بيانات.
//
// ⚠️⚠️ **العمود ممكن يكون لسه مااتعملش.** ملفات SQL عمر بيشغّلها بإيده،
// والصفحة اللي بتطلب عمود مش موجود **بتقع كلها** — فأسوأ حاجة تحصل هنا
// إن القوالب ترجع الافتراضي، مش إن الشاشة تختفي.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredTemplates } from "./message-kinds";

export async function loadStoredTemplates(
  db: SupabaseClient,
  tenantId: string
): Promise<StoredTemplates> {
  const { data, error } = await db
    .from("tenant_credentials")
    .select("message_templates, followup_template")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!error) {
    const row = data as {
      message_templates: Record<string, unknown> | null;
      followup_template: string | null;
    } | null;
    return {
      templates: row?.message_templates ?? null,
      followupTemplate: row?.followup_template ?? null,
    };
  }

  // العمود الجديد لسه مااتعملش — نرجع للقديم لوحده
  const { data: old } = await db
    .from("tenant_credentials")
    .select("followup_template")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    templates: null,
    followupTemplate:
      (old as { followup_template: string | null } | null)?.followup_template ??
      null,
  };
}
