"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkNewTenant, createTenantWithOwner } from "@/lib/create-tenant";
import { scopedEmail } from "@/lib/tenant-email";
import { claimPendingInstall } from "@/lib/shopify/claim-install";

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

  const db = createAdminClient();
  const res = await createTenantWithOwner(db, {
    businessName,
    ownerName,
    email,
    password,
  });
  if (!res.ok) back(res.error);

  // **التاجر اللي جايّ من شوبيفاي** — ركّب التطبيق قبل ما يعمل بيزنسه،
  // والتوكن مستنّي على صف التركيب. دلوقتي بيتسلّم له.
  const install = String(formData.get("install") ?? "").trim();
  let linkedShop: string | null = null;
  if (install) {
    const claim = await claimPendingInstall(db, install, res.tenantId, res.userId);
    if (claim.ok) linkedShop = claim.shop;
  }

  // دخول تلقائي. لو فشل لأي سبب، الحساب اتعمل خلاص فبنوديه لشاشة الدخول
  // بدل ما نقول له "فشل" وهو حسابه موجود.
  //
  // **بالإيميل المبوّب باسم متجره** — ده اللي الحساب اتعمل بيه، وهو اللي
  // بيخلّي نفس الإيميل ينفع في متجر تاني بعدين.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    // `slug` بيرجع فاضي لو عمود الاسم المختصر لسه ماتعملش — وساعتها
    // الحساب اتعمل بالإيميل العادي
    email: res.slug ? scopedEmail(email, res.slug) : email.trim().toLowerCase(),
    password,
  });
  if (error) {
    redirect(
      `${res.slug ? `/login/${res.slug}` : "/login"}?error=` +
        encodeURIComponent("حسابك اتعمل — سجّل دخولك بالإيميل والباسورد")
    );
  }

  redirect(
    "/settings?saved=" +
      encodeURIComponent(
        linkedShop
          ? `أهلًا بيك! متجرك ${linkedShop} اتربط خلاص`
          : "أهلًا بيك! ابدأ اربط متجرك"
      )
  );
}
