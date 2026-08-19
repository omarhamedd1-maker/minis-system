// ==========================================================================
// مفاتيح ربط البيزنس — المكان الوحيد اللي بيقراهم
// --------------------------------------------------------------------------
// كل بيزنس بيربط حساب بوسطة بتاعه هو. الجدول مقفول تمامًا — كود السيرفر
// بس هو اللي بيقراه، ومحدش يوصله من المتصفح.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** بيزنس مينيز — أول بيزنس في السيستم */
export const MINIS_TENANT = "00000000-0000-0000-0000-000000000001";

export type TenantCredentials = {
  bostaApiKey: string | null;
  bostaPickupAddressId: string | null;
  /** مفتاح ويب هوك البيزنس — بيتحط في رابط كل شحنة، اقرا `bostaWebhookUrl` */
  bostaWebhookToken: string | null;
  shopifyShop: string | null;
  shopifyAccessToken: string | null;
  shopifyWebhookSecret: string | null;
  /** بوت تليجرام بتاع البيزنس — التنبيهات بتروح على جروبه */
  telegramBotToken: string | null;
  telegramChatId: string | null;
  /** بيانات تطبيق شوبيفاي — منها بنطلع توكن مؤقت في كل تشغيل */
  shopifyClientId: string | null;
  shopifyClientSecret: string | null;
  /**
   * قالب رسالة «اسأل بعد التسليم».
   *
   * الفاضي معناه **استخدم الافتراضي** (`lib/message-template.ts`) — مش
   * «مافيش رسالة».
   */
  followupTemplate: string | null;
};

/**
 * مفاتيح البيزنس. **للسيرفر بس** — مينفعش تتنادى من المتصفح أبدًا،
 * والجدول نفسه مقفول فمحدش يقدر يقراه غير بمفتاح الأدمن.
 */
export async function loadTenantCredentials(
  db: SupabaseClient,
  tenantId: string
): Promise<TenantCredentials> {
  const { data, error } = await db
    .from("tenant_credentials")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error("معرفناش نقرا مفاتيح البيزنس: " + error.message);

  return {
    bostaApiKey: data?.bosta_api_key ?? null,
    bostaPickupAddressId: data?.bosta_pickup_address_id ?? null,
    bostaWebhookToken: data?.bosta_webhook_token ?? null,
    shopifyShop: data?.shopify_shop ?? null,
    shopifyAccessToken: data?.shopify_access_token ?? null,
    shopifyWebhookSecret: data?.shopify_webhook_secret ?? null,
    telegramBotToken: data?.telegram_bot_token ?? null,
    telegramChatId: data?.telegram_chat_id ?? null,
    shopifyClientId: data?.shopify_client_id ?? null,
    shopifyClientSecret: data?.shopify_client_secret ?? null,
    followupTemplate: data?.followup_template ?? null,
  };
}

/** كل البيزنسات الشغالة — المزامنة بتلف عليهم واحد واحد */
export async function activeTenantIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db
    .from("tenants")
    .select("id")
    .eq("active", true);

  if (error) throw new Error("معرفناش نقرا البيزنسات: " + error.message);
  return (data ?? []).map((t) => t.id as string);
}

/**
 * رابط ويب هوك بوسطة بتاع البيزنس.
 *
 * ⚠️ **بيتبعت مع كل شحنة بنعملها** (`webhookUrl` في طلب الإنشاء)، فبوسطة
 * بترنّ على عنوان البيزنس صاحب الشحنة من غير ما حد يظبّط حاجة في لوحتهم.
 * ده بيلغي أهم خطوة يدوية في تركيب أي عميل جديد.
 *
 * **الدومين من `NEXT_PUBLIC_SITE_URL`** — ومن غيره بنرجع لدومين فيرسل.
 * ⚠️ مابنستخدمش `headers()` هنا بقصد: الدالة دي بتتنادى من مسارات وخلفية
 * مالهاش طلب أصلاً، والرابط ده **بيتخزّن عند بوسطة** فلازم يبقى ثابت مش
 * متغيّر حسب اللي فتح الصفحة.
 */
export function bostaWebhookUrl(token: string | null | undefined): string | null {
  if (!token) return null;
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://minis-system.vercel.app";
  return `${origin.replace(/\/+$/, "")}/api/bosta/webhook?key=${token}`;
}
