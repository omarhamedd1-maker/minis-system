// ==========================================================================
// بيانات تطبيق شوبيفاي — صف واحد للمنصة كلها
// --------------------------------------------------------------------------
// التطبيق بيتسجّل مرة واحدة في Shopify Partners، وكل بيزنس بيربط متجره بيه
// بضغطة. فالمفاتيح دي **بتاعة المنصة مش بتاعة البيزنس** — بخلاف مفتاح
// بوسطة وتوكن تليجرام اللي كل بيزنس بيحط بتاعه.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type ShopifyApp = { clientId: string; clientSecret: string };

export async function readShopifyApp(
  db: SupabaseClient
): Promise<ShopifyApp | null> {
  try {
    const { data } = await db
      .from("shopify_app")
      .select("client_id, client_secret")
      .eq("id", 1)
      .maybeSingle();

    if (!data?.client_id || !data?.client_secret) return null;
    return { clientId: data.client_id, clientSecret: data.client_secret };
  } catch {
    return null;
  }
}

/** لينك الرجوع — لازم يطابق اللي مسجّل في لوحة شوبيفاي بالحرف */
export function callbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/shopify/callback`;
}
