"use server";

import { ltr } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { testConnection } from "@/lib/bosta/client";
import {
  fetchAccessToken,
  isValidShop,
  normalizeShop,
  testShopifyConnection,
  testShopifyToken,
} from "@/lib/shopify/client";
import { loadTenantCredentials } from "@/lib/tenant-settings";
import { readShopifyApp } from "@/lib/shopify/app";
import { resolveShopifyToken } from "@/lib/shopify/token";
import { registerShopifyWebhooks } from "@/lib/shopify/register-webhooks";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { listShopifyWebhooks } from "@/lib/shopify/register-webhooks";
import { readSyncHealth } from "@/lib/bosta/sync-runs";
import { integrationHealth, type LinkCard } from "@/lib/integration-health";
import { sendTelegramMessage } from "@/lib/telegram";

// بترجّع never لأن redirect بترمي — وده بيخلي TypeScript يفهم إن اللي بعدها
// مابيتنفذش، فمانحتاجش else في كل مكان
function back(msg: string, ok = false): never {
  redirect(`/settings?${ok ? "saved" : "error"}=` + encodeURIComponent(msg));
}

/** بيتأكد إن المفتاح شغال فعلاً عند بوسطة قبل ما نحفظه */
/**
 * الشحن الثابت — الرقم اللي بيتحصّل من العميل في أي مكان.
 *
 * ⚠️ **بيتستخدم في أوردرات اللينك المباشر** — مافيش سلة شوبيفاي تحسبه.
 * والفاضي معناه **صفر**، مش «رقم افتراضي».
 */
export async function saveFlatShipping(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const raw = Number(formData.get("flat_shipping_price") ?? 0);
  const value = Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 0;

  const db = createAdminClient();
  const { error } = await db
    .from("tenant_credentials")
    .update({ flat_shipping_price: value, updated_at: new Date().toISOString() })
    .eq("tenant_id", me.tenantId);

  if (error) back("معرفناش نحفظ سعر الشحن: " + error.message);

  await logActivity(me, "settings.shipping", `غيّر الشحن الثابت لـ${value}`);
  revalidatePath("/settings");
  back("تمام — سعر الشحن اتحفظ", true);
}

export async function saveBostaKey(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const key = String(formData.get("bosta_api_key") ?? "").trim();
  const pickup = String(formData.get("bosta_pickup") ?? "").trim();

  if (!key) back("اكتب مفتاح بوسطة");

  const result = await testConnection(key);
  if (!result.ok) {
    back("المفتاح مارضيش يشتغل: " + (result.error ?? "بوسطة رفضته"));
  }

  const db = createAdminClient();

  // ⚠️ **مفتاح الويب هوك بيتولّد هنا مرة واحدة ومابيتغيّرش.**
  //
  // من غيره، ربط بوسطة كان بيحتاج خطوة برّه السيستم: حد يدخل أسرار
  // سوبابيز ويطلّع `BOSTA_WEBHOOK_KEY` ويلزقه في الرابط. والسرّ ده واحد
  // للمشروع كله، فعرضه على الشاشة معناه إن **كل عميل يشوف مفتاح كل
  // العملاء** — ولو اتسرّب من واحد، تغييره بيقع على الكل.
  //
  // المفتاح ده بتاع البيزنس لوحده، فالشاشة تقدر توري الرابط كامل جاهز
  // للنسخ. **وتوليده مرة واحدة مقصود**: لو اتغيّر مع كل حفظ، الرابط
  // المحطوط عند بوسطة يبوظ في صمت وأول ما تحصل مشكلة محدش يعرف ليه.
  const { data: existing } = await db
    .from("tenant_credentials")
    .select("bosta_webhook_token")
    .eq("tenant_id", me.tenantId)
    .maybeSingle();
  const hasToken = Boolean(
    (existing as { bosta_webhook_token: string | null } | null)?.bosta_webhook_token
  );

  const { error } = await db
    .from("tenant_credentials")
    .update({
      bosta_api_key: key,
      bosta_pickup_address_id: pickup || null,
      ...(hasToken ? {} : { bosta_webhook_token: randomUUID().replace(/-/g, "") }),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) back("معرفناش نحفظ المفتاح: " + error.message);

  await logActivity(me, "settings.bosta", "ربط حساب بوسطة");
  revalidatePath("/settings");
  back("تمام — المفتاح اتجرّب واشتغل واتحفظ", true);
}

/**
 * تنبيهات تليجرام. بنجرّبها قبل الحفظ زي مفتاح بوسطة بالظبط — التنبيه اللي
 * ماوصلش أوحش من إنه مش موجود، فمينفعش نحفظ إعداد ماجرّبناهوش.
 */
export async function saveShopify(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const shop = normalizeShop(String(formData.get("shopify_shop") ?? ""));
  const clientId = String(formData.get("shopify_client_id") ?? "").trim();
  const secretInput = String(formData.get("shopify_client_secret") ?? "").trim();

  const db = createAdminClient();

  if (!shop && !clientId && !secretInput) {
    const { error } = await db
      .from("tenant_credentials")
      .update({
        shopify_shop: null,
        shopify_client_id: null,
        shopify_client_secret: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", me.tenantId);
    if (error) back("معرفناش نحفظ: " + error.message);
    await logActivity(me, "settings.shopify", "فصل ربط شوبيفاي");
    revalidatePath("/settings");
    back("ربط شوبيفاي اتفصل", true);
  }

  if (!isValidShop(shop)) {
    back(`دومين المتجر لازم يبقى بالشكل ده: ${ltr("yourshop.myshopify.com")}`);
  }

  // ⚠️⚠️ **التوكن الجاهز هو الطريق الصح لتطبيق متعمول جوّه المتجر.**
  //
  // التطبيق اللي بيتعمل من `Settings ← Apps ← Develop apps` بيدّيك
  // **Admin API access token** (`shpat_…`) على طول. و`API key`/`API secret`
  // بتوعه **مابيطلّعوش توكن**: شوبيفاي بترد ٤٠٠ من غير سبب في الرد،
  // فالرسالة كانت بتطلع «شوبيفاي ردّت بكود ٤٠٠» ومحدش يعرف ليه.
  //
  // وكان فيه غلط تاني أعمق: حتى لو التبادل نجح، الحفظ كان بيكتب
  // `client_id`/`client_secret` بس — والاستيراد بيقرا `shopify_access_token`
  // وبس. يعني الربط كان بيتقال عنه نجح والاستيراد يقول «مش مربوط».
  const tokenInput = String(formData.get("shopify_token") ?? "").trim();
  if (tokenInput) {
    const test = await testShopifyToken(shop, tokenInput);
    if (!test.ok) back("الاتصال مارضيش يشتغل: " + test.error);

    const { error } = await db
      .from("tenant_credentials")
      .update({
        shopify_shop: shop,
        shopify_access_token: tokenInput,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", me.tenantId);
    if (error) back("معرفناش نحفظ: " + error.message);

    await logActivity(me, "settings.shopify", `ربط متجر ${test.shop.name}`);
    revalidatePath("/settings");
    back(`اتربط متجر ${test.shop.name}`, true);
  }

  if (!clientId) back("اكتب Client ID بتاع التطبيق");

  // السر بيتعرض كنقط، فلو سابه فاضي معناها "سيبه زي ما هو"
  const creds = await loadTenantCredentials(db, me.tenantId);
  const clientSecret = secretInput || creds.shopifyClientSecret || "";
  if (!clientSecret) back("اكتب Client Secret بتاع التطبيق");

  const result = await testShopifyConnection({ shop, clientId, clientSecret });
  if (!result.ok) back("الاتصال مارضيش يشتغل: " + result.error);

  // ⚠️⚠️ **التوكن لازم يتحفظ، مش المفاتيح بس.**
  //
  // كل كود الاستيراد بيقرا `shopify_access_token` وبس (`orders.ts` ·
  // `products.ts` · `order-push.ts`). والنسخة القديمة كانت بتحفظ المفتاح
  // والسر وخلاص — فالشاشة تقول «اتصلنا بمتجرك» وشارة الحالة تفضل «لسه»،
  // والاستيراد الدوري يقول «البيزنس ده لسه مربطش متجر شوبيفاي».
  //
  // مسار محدش عدّى منه لآخره: الربط بيبان ناجح والأوردرات ماتيجيش.
  let token: string | null = null;
  try {
    token = await fetchAccessToken({ shop, clientId, clientSecret });
  } catch {
    // الاتصال نجح فوق، فالفشل هنا نادر — بنكمّل ونحفظ المفاتيح على الأقل
  }

  const { error } = await db
    .from("tenant_credentials")
    .update({
      shopify_shop: shop,
      shopify_client_id: clientId,
      shopify_client_secret: clientSecret,
      ...(token ? { shopify_access_token: token } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) {
    back(
      "معرفناش نحفظ: " +
        error.message +
        " — لو الخانات لسه مااتعملتش شغّل sql/shopify-credentials.sql"
    );
  }

  await logActivity(me, "settings.shopify", `ربط متجر شوبيفاي ${result.shop.name}`);

  // ⚠️⚠️ **من غير ده الأوردر بيستنى ربع ساعة.**
  //
  // الويب هوك بتاع مينيز و٢ سِك اتسجّل **بالإيد** (١٧ أغسطس)، وماكانش فيه
  // كود بيعمله. يعني أي بيزنس جديد كان بيربط متجره والأوردرات تيجي باللفة
  // الدورية بس — بيشتغل، بس بطيء، ومحدش يعرف ليه.
  //
  // **والفشل هنا مش فشل في الربط** — اللفة الدورية شبكة الأمان، فالرسالة
  // بتقول إيه اللي حصل من غير ما تخوّف.
  let hooks = "";
  if (token) {
    const r = await registerShopifyWebhooks({
      shop,
      token,
      callbackUrl: `https://${
        (await headers()).get("host") ?? "minis-system.vercel.app"
      }/api/shopify/webhooks`,
    });
    if (r.created.length > 0) hooks = " · والأوردر الجديد هييجي فورًا";
    else if (r.alreadyOk.length > 0) hooks = " · الأوردر الفوري شغّال خلاص";
    else if (r.failed.length > 0) hooks = " · الأوردر هييجي كل ربع ساعة";
  }

  revalidatePath("/settings");
  back(`تمام — اتصلنا بمتجر "${result.shop.name}" واتحفظ${hooks}`, true);
}

/** بيجرّب المفاتيح المحفوظة من غير ما يغيّر حاجة */
export async function checkShopifyConnection() {
  const me = await requirePermission("admin.settings");
  const creds = await loadTenantCredentials(createAdminClient(), me.tenantId);

  if (!creds.shopifyShop || !creds.shopifyClientId || !creds.shopifyClientSecret) {
    back("لسه مفيش مفاتيح محفوظة");
  }

  const result = await testShopifyConnection({
    shop: creds.shopifyShop!,
    clientId: creds.shopifyClientId!,
    clientSecret: creds.shopifyClientSecret!,
  });

  if (result.ok) {
    back(
      `الاتصال شغال ✓ — "${result.shop.name}" (${result.shop.currency})`,
      true
    );
  }
  back("الاتصال مش شغال: " + result.error);
}

/** بيبعت رسالة تجربة بالمفاتيح المحفوظة */
/** بيجرّب المفتاح المحفوظ من غير ما يغيّر حاجة */
export async function checkBostaConnection() {
  const me = await requirePermission("admin.settings");

  const { data } = await createAdminClient()
    .from("tenant_credentials")
    .select("bosta_api_key")
    .eq("tenant_id", me.tenantId)
    .maybeSingle();

  if (!data?.bosta_api_key) back("لسه مفيش مفتاح محفوظ");

  const result = await testConnection(data!.bosta_api_key!);
  if (result.ok) back("الاتصال ببوسطة شغال ✓", true);
  back("الاتصال مش شغال: " + (result.error ?? "بوسطة رفضت المفتاح"));
}

/**
 * بيانات تطبيق شوبيفاي — لصاحب المنصة بس.
 * دي مفاتيح المنصة كلها مش بتاعة بيزنس، فبتتحط مرة واحدة.
 */
export async function saveShopifyApp(formData: FormData) {
  const me = await requirePermission("admin.settings");
  if (!me.isPlatformAdmin) back("ده لصاحب المنصة بس");

  const clientId = String(formData.get("app_client_id") ?? "").trim();
  const secretInput = String(formData.get("app_client_secret") ?? "").trim();

  const db = createAdminClient();

  if (!clientId && !secretInput) {
    await db.from("shopify_app").delete().eq("id", 1);
    await logActivity(me, "settings.shopify_app", "شال بيانات تطبيق شوبيفاي");
    revalidatePath("/settings");
    back("بيانات التطبيق اتشالت", true);
  }

  if (!clientId) back("اكتب Client ID");

  // السر بيتعرض كنقط، فلو سابه فاضي معناها "سيبه زي ما هو"
  const existing = await readShopifyApp(db);
  const clientSecret = secretInput || existing?.clientSecret || "";
  if (!clientSecret) back("اكتب Client Secret");

  const { error } = await db.from("shopify_app").upsert(
    {
      id: 1,
      client_id: clientId,
      client_secret: clientSecret,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    back(
      "معرفناش نحفظ: " +
        error.message +
        " — لو الجداول لسه مااتعملتش شغّل sql/shopify-app.sql"
    );
  }

  await logActivity(me, "settings.shopify_app", "ظبّط بيانات تطبيق شوبيفاي");
  revalidatePath("/settings");
  back("تمام — التطبيق اتظبّط. دلوقتي أي بيزنس يقدر يربط متجره بضغطة", true);
}

/** بيفصل ربط المتجر (مش بيلغي التطبيق) */
export async function disconnectShopify() {
  const me = await requirePermission("admin.settings");
  const { error } = await createAdminClient()
    .from("tenant_credentials")
    .update({
      shopify_shop: null,
      shopify_access_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) back("معرفناش نفصل الربط: " + error.message);
  await logActivity(me, "settings.shopify", "فصل ربط متجر شوبيفاي");
  revalidatePath("/settings");
  back("الربط اتفصل", true);
}

/**
 * بيسأل شوبيفاي وبوسطة **دلوقتي** ويرجّع حالتهم.
 *
 * ⚠️⚠️ **بالطلب مش لوحده.** لو الفحص اتعمل مع كل فتحة للصفحة، الصفحة
 * هتستنى الطرف الواقع لحد ما يقطع الاتصال — يعني الوصلة الواقعة تعطّل
 * الشاشة اللي المفروض تصلّحها.
 *
 * ⚠️ **وبيقرا بس** — مافيش تسجيل ويبهوكس ولا حفظ مفاتيح جوّه فحص.
 */
export async function checkIntegrations(): Promise<LinkCard[]> {
  const me = await requirePermission("admin.settings");
  const db = createAdminClient();
  const creds = await loadTenantCredentials(db, me.tenantId);

  const shopLinked = Boolean(creds.shopifyShop);
  const bostaLinked = Boolean(creds.bostaApiKey);

  // ⚠️⚠️ **الفحص لازم يستخدم نفس التوكن اللي الاستيراد بيستخدمه.**
  // لو فحصنا بالتوكن المتخزّن، الشاشة تقول «المفتاح مرفوض» والاستيراد
  // شغّال — أو العكس. والتوكن المتخزّن بيموت بعد ٢٤ ساعة.
  const auth = shopLinked
    ? await resolveShopifyToken(db, me.tenantId, creds)
    : null;
  const live = auth?.ok ? auth : null;

  const [shopProbe, hooks, bostaProbe, sync, lastOrder] = await Promise.all([
    live
      ? testShopifyToken(live.shop, live.token)
      : shopLinked
        ? Promise.resolve({
            ok: false as const,
            error: auth && !auth.ok ? auth.error : "معرفناش نطلّع توكن",
          })
        : null,
    live
      ? listShopifyWebhooks({ shop: live.shop, token: live.token })
      : null,
    bostaLinked ? testConnection(creds.bostaApiKey!) : null,
    readSyncHealth(db, me.tenantId),
    db
      .from("orders")
      .select("order_date")
      .eq("tenant_id", me.tenantId)
      .order("order_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return integrationHealth(
    {
      shopify: {
        linked: shopLinked,
        probe: shopProbe
          ? shopProbe.ok
            ? { ok: true }
            : { ok: false, error: shopProbe.error }
          : null,
        webhooks: hooks === null ? null : hooks.length,
        lastOrderAt:
          (lastOrder.data as { order_date?: string } | null)?.order_date ?? null,
      },
      bosta: {
        linked: bostaLinked,
        probe: bostaProbe,
        // ⚠️ «مش عارفين» (الجدول لسه مااتعملش) مش نفس «ولا مرة»
        lastSyncAt:
          sync.state === "unknown" ? new Date().toISOString() : (sync.lastRun?.created_at ?? null),
        lastSyncFailed: sync.state === "failing",
      },
    },
    new Date()
  );
}

/**
 * جروب النسخة الاحتياطية.
 *
 * ⚠️⚠️ **البوت لازم يكون عضو في الجروب** — التوكن لوحده مابيبعتش، وتليجرام
 * بيرد ساعتها بـ`chat not found` اللي شكلها كأن التوكن غلط وهو صح. عشان
 * كده بنجرّب بعتة حقيقية قبل الحفظ بدل ما نكتشف ده بعد شهر من نسخ ماراحتش.
 */
export async function saveBackupGroup(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const token = String(formData.get("telegram_bot_token") ?? "").trim();
  const chat = String(formData.get("telegram_chat_id") ?? "").trim();

  const db = createAdminClient();

  // الاتنين فاضيين = إيقاف النسخة
  if (!token && !chat) {
    const { error } = await db
      .from("tenant_credentials")
      .update({
        telegram_bot_token: null,
        telegram_chat_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", me.tenantId);
    if (error) back("معرفناش نحفظ: " + error.message);
    await logActivity(me, "settings.backup", "وقّف النسخة الاحتياطية");
    revalidatePath("/settings");
    back("النسخة الاحتياطية اتوقفت", true);
  }

  if (!token || !chat) back("محتاج توكن البوت ورقم الجروب الاتنين");

  const test = await sendTelegramMessage(
    token,
    chat,
    "تمام — النسخة الاحتياطية هتيجي على الجروب ده كل يوم."
  );
  if (!test.ok) back("تليجرام رفض: " + (test.error ?? "مانفعش"));

  const { error } = await db
    .from("tenant_credentials")
    .update({
      telegram_bot_token: token,
      telegram_chat_id: chat,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) back("معرفناش نحفظ: " + error.message);

  await logActivity(me, "settings.backup", "ظبّط جروب النسخة الاحتياطية");
  revalidatePath("/settings");
  back("تمام — بعتنا رسالة تجربة على الجروب", true);
}
