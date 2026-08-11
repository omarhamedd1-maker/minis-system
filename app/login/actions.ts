"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findTenantByNameOrSlug } from "@/lib/tenant-lookup";

/**
 * الصفحة دي **مابقتش باب دخول** — بتسأل عن المتجر بس وبتوديك على بابه.
 *
 * قبل كده كانت بتاخد إيميل وباسورد من غير ما تسأل عن المتجر أصلًا، فنفس
 * الصفحة كانت بتفتح لأي بيزنس. ومكانتش تسريب داتا — كل واحد بيروح لبيزنسه
 * من `app_users` — **بس كانت بتتخطّى الفحص اللي في `/login/<المتجر>`**:
 * هناك الحساب اللي مش من المتجر بيترفض، وهنا كان بيعدّي.
 *
 * وده كمان بيكسر اللي بنبيعه للعميل: إن متجره ليه بابه واسمه عليه.
 */
export async function goToStore(formData: FormData) {
  const typed = String(formData.get("store") ?? "").trim();
  if (!typed) {
    redirect("/login?error=" + encodeURIComponent("اكتب اسم متجرك"));
  }

  const tenant = await findTenantByNameOrSlug(createAdminClient(), typed);

  if (!tenant) {
    redirect(
      "/login?error=" +
        encodeURIComponent("مالقيناش متجر بالاسم ده — راجع الرابط اللي وصلك")
    );
  }

  redirect(`/login/${tenant.slug}`);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
