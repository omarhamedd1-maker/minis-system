// ==========================================================================
// مفاتيح ربط البيزنس — المكان الوحيد اللي بيقراهم
// --------------------------------------------------------------------------
// كل بيزنس بيربط حساب بوسطة بتاعه هو. الجدول مقفول تمامًا — كود السيرفر
// بس هو اللي بيقراه، ومحدش يوصله من المتصفح.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** بيزنس مينيس — أول بيزنس في السيستم */
export const MINIS_TENANT = "00000000-0000-0000-0000-000000000001";

export type TenantCredentials = {
  bostaApiKey: string | null;
  bostaPickupAddressId: string | null;
  shopifyShop: string | null;
  shopifyAccessToken: string | null;
  shopifyWebhookSecret: string | null;
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
    shopifyShop: data?.shopify_shop ?? null,
    shopifyAccessToken: data?.shopify_access_token ?? null,
    shopifyWebhookSecret: data?.shopify_webhook_secret ?? null,
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
