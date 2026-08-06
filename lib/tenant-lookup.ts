// ==========================================================================
// إيجاد المتجر من اسمه المختصر
// --------------------------------------------------------------------------
// بيتنادى من صفحة دخول المتجر وقبل تسجيل الدخول — يعني **قبل ما يكون فيه
// جلسة أصلًا**، فمفتاح الأدمن هو الوحيد اللي بيقدر يقرا.
//
// **وبنقرا الاسم والاسم المختصر بس.** حاجة تانية من `tenants` مالهاش لازمة
// في شاشة دخول، وأي حاجة زيادة هنا معناها إن أي حد يعرف الاسم المختصر
// يقدر يشوفها من غير حساب.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicTenant = { id: string; name: string; slug: string };

export async function findTenantBySlug(
  db: SupabaseClient,
  slug: string
): Promise<PublicTenant | null> {
  const s = String(slug ?? "").trim().toLowerCase();
  if (!s) return null;

  try {
    const { data, error } = await db
      .from("tenants")
      .select("id, name, slug")
      .eq("slug", s)
      .maybeSingle();

    // العمود لسه ماتعملش (`sql/tenant-slug.sql` ماتشغّلش)؟ نعدّي بهدوء
    if (error || !data) return null;
    return data as PublicTenant;
  } catch {
    return null;
  }
}

/** البيزنس بتاع مستخدم — بنستخدمه بعد الدخول عشان نتأكد إنه في متجره */
export async function tenantOfAuthUser(
  db: SupabaseClient,
  authUserId: string
): Promise<string | null> {
  try {
    const { data } = await db
      .from("app_users")
      .select("tenant_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    return (data as { tenant_id: string } | null)?.tenant_id ?? null;
  } catch {
    return null;
  }
}
