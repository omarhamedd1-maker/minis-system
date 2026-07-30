"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { testConnection } from "@/lib/bosta/client";
import {
  isValidShop,
  normalizeShop,
  testShopifyConnection,
} from "@/lib/shopify/client";
import { loadTenantCredentials } from "@/lib/tenant-settings";
import { readShopifyApp } from "@/lib/shopify/app";
import { discoverChats, looksLikeChatId, testTelegram } from "@/lib/telegram";

// بترجّع never لأن redirect بترمي — وده بيخلي TypeScript يفهم إن اللي بعدها
// مابيتنفذش، فمانحتاجش else في كل مكان
function back(msg: string, ok = false): never {
  redirect(`/settings?${ok ? "saved" : "error"}=` + encodeURIComponent(msg));
}

/** بيتأكد إن المفتاح شغال فعلاً عند بوسطة قبل ما نحفظه */
export async function saveBostaKey(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const key = String(formData.get("bosta_api_key") ?? "").trim();
  const pickup = String(formData.get("bosta_pickup") ?? "").trim();

  if (!key) back("اكتب مفتاح بوسطة");

  const result = await testConnection(key);
  if (!result.ok) {
    back("المفتاح مارضيش يشتغل: " + (result.error ?? "بوسطة رفضته"));
  }

  const { error } = await createAdminClient()
    .from("tenant_credentials")
    .update({
      bosta_api_key: key,
      bosta_pickup_address_id: pickup || null,
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
export async function saveTelegram(formData: FormData) {
  const me = await requirePermission("admin.settings");
  const token = String(formData.get("telegram_bot_token") ?? "").trim();
  let chatId = String(formData.get("telegram_chat_id") ?? "").trim();

  const db = createAdminClient();

  // فاضيين = إيقاف التنبيهات
  if (!token && !chatId) {
    const { error } = await db
      .from("tenant_credentials")
      .update({
        telegram_bot_token: null,
        telegram_chat_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", me.tenantId);
    if (error) back("معرفناش نحفظ: " + error.message);
    await logActivity(me, "settings.telegram", "وقّف تنبيهات تليجرام");
    revalidatePath("/settings");
    back("التنبيهات اتوقفت", true);
  }

  if (!token) back("اكتب توكن البوت");

  // قيمة مش على شكل رقم جروب (مثلاً إيميل حطّه المتصفح autofill) بنرميها
  // ونلاقي الجروب بنفسنا — أحسن من إننا نحفظ حاجة غلط وتفشل بعد كده
  if (chatId && !looksLikeChatId(chatId)) chatId = "";

  // مافيش رقم جروب؟ نلاقيه إحنا بدل ما المستخدم يقرا JSON بإيده
  if (!chatId) {
    const found = await discoverChats(token);
    if (!found.ok) back("التوكن مارضيش يشتغل: " + found.error);

    if (found.chats.length === 0) {
      // السبب الأشهر: خصوصية البوت مفعّلة (وهي الافتراضي)، فالرسايل العادية
      // مابتوصلهوش خالص. الأوامر اللي بتبدأ بـ / بتوصل دايمًا.
      back(
        "البوت مش شايف الجروب. ابعت في الجروب /start بالظبط (كلمة عادية مش بتوصله لأن خصوصية البوت مفعّلة)، وبعدين دوس احفظ تاني."
      );
    }
    if (found.chats.length > 1) {
      back(
        "البوت شايف أكتر من محادثة — اكتب رقم اللي عايزه في خانة رقم الجروب: " +
          found.chats.map((c) => `${c.title} (${c.id})`).join(" · ")
      );
    }
    chatId = found.chats[0].id;
  }

  const { error } = await db
    .from("tenant_credentials")
    .update({
      telegram_bot_token: token,
      telegram_chat_id: chatId,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", me.tenantId);

  if (error) {
    back(
      "معرفناش نحفظ: " +
        error.message +
        " — لو الخانات لسه مااتعملتش شغّل sql/telegram.sql"
    );
  }

  // بنجرّب بعد الحفظ عشان الإرسال بيقرا المفاتيح من الجدول
  const test = await testTelegram(db, me.tenantId);
  if (!test.ok) {
    back(
      "اتحفظ بس التجربة فشلت: " +
        (test.reason === "not_configured"
          ? "المفاتيح مش مقروءة"
          : (test.error ?? "تليجرام رفض"))
    );
  }

  await logActivity(me, "settings.telegram", "ربط تنبيهات تليجرام");
  revalidatePath("/settings");
  back("تمام — بعتنا رسالة تجربة على الجروب", true);
}

/**
 * مفاتيح شوبيفاي. زي بوسطة: **مش بنحفظ غير بعد ما نتأكد إنها بتشتغل فعلاً**
 * وبنقرا اسم المتجر — مش بنكتفي بردّ ٢٠٠ (الدرس من مسار المدن في بوسطة).
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
    back("دومين المتجر لازم يبقى بالشكل ده: yourshop.myshopify.com");
  }
  if (!clientId) back("اكتب Client ID بتاع التطبيق");

  // السر بيتعرض كنقط، فلو سابه فاضي معناها "سيبه زي ما هو"
  const creds = await loadTenantCredentials(db, me.tenantId);
  const clientSecret = secretInput || creds.shopifyClientSecret || "";
  if (!clientSecret) back("اكتب Client Secret بتاع التطبيق");

  const result = await testShopifyConnection({ shop, clientId, clientSecret });
  if (!result.ok) back("الاتصال مارضيش يشتغل: " + result.error);

  const { error } = await db
    .from("tenant_credentials")
    .update({
      shopify_shop: shop,
      shopify_client_id: clientId,
      shopify_client_secret: clientSecret,
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
  revalidatePath("/settings");
  back(`تمام — اتصلنا بمتجر "${result.shop.name}" واتحفظ`, true);
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
export async function checkTelegram() {
  const me = await requirePermission("admin.settings");
  const result = await testTelegram(createAdminClient(), me.tenantId);
  if (result.ok) back("الرسالة وصلت الجروب ✓", true);
  back(
    result.reason === "not_configured"
      ? "لسه مفيش بوت محفوظ"
      : "مااتبعتتش: " + (result.error ?? "تليجرام رفض")
  );
}

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
