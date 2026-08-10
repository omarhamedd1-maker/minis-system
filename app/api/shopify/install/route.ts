import { ltr } from "@/lib/format";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/permissions";
import { callbackUrl, readShopifyApp } from "@/lib/shopify/app";
import { buildInstallUrl, checkInstallStart, newState } from "@/lib/shopify/oauth";
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

  const { searchParams, origin } = new URL(req.url);
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => (params[k] = v));
  const shop = normalizeShop(params.shop);

  const back = (msg: string) =>
    redirect("/settings?error=" + encodeURIComponent(msg));

  if (!isValidShop(shop)) {
    back(
      isCustomDomain(shop)
        ? `${ltr(shop)} ده دومين متجرك اللي العميل بيشوفه، وشوبيفاي بتطلب دومين الأدمن. هتلاقيه في لوحة شوبيفاي تحت الإعدادات ← الدومينات، وشكله كده: ${ltr("yourshop.myshopify.com")}`
        : `اكتب اسم متجرك أو دومينه — مثلًا ${ltr("yourshop")} أو ${ltr("yourshop.myshopify.com")}`
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

  // **مين بدأ التركيب؟** واحد داخل بحسابه، ولا تاجر جايّ من شوبيفاي
  // ومالوش حساب عندنا. التانية دي كانت بترد ٤٠١ وبتوقف المراجعة.
  const who = checkInstallStart(params, app!.clientSecret, Boolean(user));
  if (!who.ok) back(who.error);

  const state = newState();
  const { error } = await db.from("shopify_installs").insert({
    state,
    // **بلا بيزنس لو جايّ من شوبيفاي** — التاجر هيعمل بيزنسه بعد الموافقة
    // وساعتها يتسلّم التوكن
    tenant_id: user?.tenantId ?? null,
    shop,
    started_by: user?.authUserId ?? null,
  });
  if (error) {
    back(
      "معرفناش نبدأ الربط: " +
        error.message +
        " — لو الخانات لسه مااتعملتش شغّل sql/shopify-public-install.sql"
    );
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
