// ==========================================================================
// تسليم التركيب المستنّي لبيزنس
// --------------------------------------------------------------------------
// التاجر اللي ركّب التطبيق من شوبيفاي مالوش بيزنس عندنا وقت التركيب،
// فالتوكن بيستنى على صف التركيب (`shopify_installs.access_token`).
//
// أول ما يعمل بيزنسه، الدالة دي بتنقل التوكن لمفاتيح البيزنس **وتمسحه من
// مكانه القديم** — عشان التوكن مايفضلش في مكانين.
//
// ⚠️ **والتسليم مرة واحدة بس.** لو اتسلّم قبل كده بيترفض — وإلا حد معاه
// اللينك القديم يقدر يربط متجر التاجر ببيزنسه هو.
// ==========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimResult =
  | { ok: true; shop: string }
  | { ok: false; error: string };

/** كام دقيقة التركيب يفضل صالح للتسليم */
const CLAIM_MAX_AGE_MS = 60 * 60 * 1000;

export async function claimPendingInstall(
  db: SupabaseClient,
  state: string,
  tenantId: string,
  claimedBy?: string | null
): Promise<ClaimResult> {
  const key = String(state ?? "").trim();
  if (!key) return { ok: false, error: "مفيش تركيب" };

  const { data, error } = await db
    .from("shopify_installs")
    .select("state, shop, access_token, claimed_at, completed_at, created_at")
    .eq("state", key)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "التركيب ده مش معروف عندنا" };

  const row = data as {
    shop: string | null;
    access_token: string | null;
    claimed_at: string | null;
    created_at: string;
  };

  if (row.claimed_at) return { ok: false, error: "التركيب ده اتسلّم قبل كده" };
  if (!row.access_token || !row.shop) {
    return { ok: false, error: "التركيب ده لسه ماخلصش" };
  }
  if (Date.now() - new Date(row.created_at).getTime() > CLAIM_MAX_AGE_MS) {
    return { ok: false, error: "التركيب اتأخر كتير — اربط متجرك من الإعدادات" };
  }

  const { error: saveError } = await db
    .from("tenant_credentials")
    .update({
      shopify_shop: row.shop,
      shopify_access_token: row.access_token,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  if (saveError) {
    return { ok: false, error: "معرفناش نحفظ الربط: " + saveError.message };
  }

  // **التوكن بيتمسح من التركيب** — مانسيبوش في مكانين
  await db
    .from("shopify_installs")
    .update({
      tenant_id: tenantId,
      access_token: null,
      claimed_at: new Date().toISOString(),
      claimed_by: claimedBy ?? null,
    })
    .eq("state", key);

  return { ok: true, shop: row.shop };
}
