"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkNewTenant, createTenantWithOwner } from "@/lib/create-tenant";

function back(msg: string): never {
  redirect("/signup?error=" + encodeURIComponent(msg));
}

/**
 * العميل بيعمل بيزنسه بنفسه.
 *
 * **مافيش صلاحية مطلوبة هنا بقصد** — دي الشاشة الوحيدة المفتوحة للناس اللي
 * لسه مالهاش حساب. وعشان كده الفحص بيحصل على كل خانة، والحساب اللي بيتعمل
 * بياخد صلاحيات **بيزنسه هو بس** (`is_platform_admin` بـ`false` صريح).
 *
 * وبعد الإنشاء بنسجّل دخوله على طول — عشان مايدخلش بياناته مرتين.
 */
export async function signup(formData: FormData) {
  const businessName = String(formData.get("business_name") ?? "");
  const ownerName = String(formData.get("owner_name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = checkNewTenant({
    businessName,
    ownerName,
    email,
    password,
    confirm,
  });
  if (problem) back(problem);

  const res = await createTenantWithOwner(createAdminClient(), {
    businessName,
    ownerName,
    email,
    password,
  });
  if (!res.ok) back(res.error);

  // دخول تلقائي. لو فشل لأي سبب، الحساب اتعمل خلاص فبنوديه لشاشة الدخول
  // بدل ما نقول له "فشل" وهو حسابه موجود.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    redirect(
      "/login?error=" +
        encodeURIComponent("حسابك اتعمل — سجّل دخولك بالإيميل والباسورد")
    );
  }

  redirect("/settings?saved=" + encodeURIComponent("أهلًا بيك! ابدأ اربط متجرك"));
}
