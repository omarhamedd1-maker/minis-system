import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/permissions";
import { callbackUrl, readShopifyApp } from "@/lib/shopify/app";
import { buildInstallUrl, newState } from "@/lib/shopify/oauth";
import { isCustomDomain, isValidShop, normalizeShop } from "@/lib/shopify/client";

/**
 * بداية ربط شوبيفاي.
 *
 * بيولّد `state` عشوائي، بيخزّنه مربوط بالبيزنس، وبيوجّه المستخدم لشوبيفاي.
 * الـ`state` ده هو اللي بيمنع حد يزوّر لينك رجوع ويربط متجره ببيزنس تاني —
 * لأننا بنقارنه لما شوبيفاي ترجّعه.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams, origin } = new URL(req.url);
  const shop = normalizeShop(searchParams.get("shop"));

  const back = (msg: string) =>
    redirect("/settings?error=" + encodeURIComponent(msg));

  if (!isValidShop(shop)) {
    back(
      isCustomDomain(shop)
        ? `"${shop}" ده دومين متجرك اللي العميل بيشوفه، وشوبيفاي بتطلب دومين الأدمن. هتلاقيه في لوحة شوبيفاي تحت الإعدادات ← الدومينات، وشكله كده: yourshop.myshopify.com`
        : "اكتب اسم متجرك أو دومينه — مثلًا yourshop أو yourshop.myshopify.com"
    );
  }

  // **الربط مابيشتغلش محليًا.** عنوان الرجوع لازم يكون مسجّل بالحرف في لوحة
  // شوبيفاي، وعنوان النسخة المحلية مش مسجّل — فشوبيفاي بترد بصفحة خطأ ٥٠٠
  // مش مفهومة. بنقولها بالعربي قبل ما نوديه هناك.
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
    back(
      "ربط شوبيفاي مابيشتغلش على النسخة المحلية — جرّبه من الموقع الحقيقي"
    );
  }

  const db = createAdminClient();
  const app = await readShopifyApp(db);
  if (!app) {
    back(
      "تطبيق شوبيفاي لسه مش مظبّط — صاحب المنصة لازم يحط بياناته الأول"
    );
  }

  const state = newState();
  const { error } = await db.from("shopify_installs").insert({
    state,
    tenant_id: user.tenantId,
    shop,
    started_by: user.authUserId,
  });
  if (error) {
    back("معرفناش نبدأ الربط: " + error.message);
  }

  const url = buildInstallUrl({
    shop,
    clientId: app!.clientId,
    redirectUri: callbackUrl(origin),
    state,
  });
  if (!url) back("دومين المتجر مش مظبوط");

  redirect(url!);
}
